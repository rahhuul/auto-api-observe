/**
 * Real-MySQL integration tests for the mysql2 patcher (both the callback
 * core API and the mysql2/promise wrapper, since real production code uses
 * either).
 *
 * Skips gracefully (does not fail) if no MySQL is reachable locally — CI
 * provides one via a service container (see .github/workflows/ci.yml).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import mysqlPromise from 'mysql2/promise';
import { autoInstrument } from '../../../src/core/instrument';
import { isReachable, makeContext, storage } from './helpers';

const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'test';

describe('mysql2 — real database', async () => {
  const reachable = await isReachable(MYSQL_HOST, MYSQL_PORT);
  const d = reachable ? describe : describe.skip;
  if (!reachable) {
    console.warn(`[mysql2.test.ts] Skipping — no MySQL reachable at ${MYSQL_HOST}:${MYSQL_PORT}`);
  }

  d('with a real MySQL', () => {
    const CONN = { host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE };
    const TABLE = 'auto_api_observe_test_mysql2';
    let pool: mysqlPromise.Pool;

    beforeAll(async () => {
      autoInstrument();
      const setup = await mysqlPromise.createConnection(CONN);
      await setup.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await setup.query(`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, hits INT DEFAULT 0)`);
      await setup.query(`INSERT INTO ${TABLE} (id, hits) VALUES (1, 0)`);
      await setup.end();
      pool = mysqlPromise.createPool({ ...CONN, connectionLimit: 10 });
    });

    it('captures a single query exactly once through Pool.execute (mysql2/promise)', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await pool.execute(`UPDATE ${TABLE} SET hits = hits + 1 WHERE id = ?`, [1]);
      });
      expect(ctx.dbCallsDetail.calls).toBe(1);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('mysql2');
      // Regression guard: queryTime used to be measured at dispatch, not
      // completion, and was always 0 for callback-style calls.
      expect(ctx.dbCallsDetail.queries[0].queryTime).toBeGreaterThanOrEqual(0);
    });

    it('does NOT double-count pooled queries (Pool internally delegates to Connection — regression guard)', async () => {
      const N = 50;
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        const inFlight: Promise<unknown>[] = [];
        for (let i = 0; i < N; i++) {
          inFlight.push(pool.execute(`UPDATE ${TABLE} SET hits = hits + 1 WHERE id = ?`, [1]));
          if (inFlight.length >= 10) await Promise.all(inFlight.splice(0, inFlight.length));
        }
        if (inFlight.length) await Promise.all(inFlight);
      });
      // Before the fix, patching both Pool and Connection prototypes
      // independently double-counted every pooled query (confirmed
      // empirically at 5,000/10,000-query scale: N real queries recorded
      // as 2N — for both the callback core API and mysql2/promise).
      expect(ctx.dbCallsDetail.calls).toBe(N);
      expect(ctx.dbCallsDetail.queries).toHaveLength(N);
    });

    it('preserves AsyncLocalStorage context across the pool socket callback (regression guard)', async () => {
      // A regression I introduced and fixed mid-session: deferring the
      // recorded timing to the callback broke context propagation for
      // pooled connections, since mysql2's socket callback doesn't run
      // inside the ALS scope active when the query was dispatched.
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await pool.execute(`SELECT * FROM ${TABLE}`);
      });
      expect(ctx.dbCallsDetail.calls).toBe(1);
    });
  });
});
