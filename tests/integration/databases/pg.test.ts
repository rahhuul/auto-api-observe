/**
 * Real-Postgres integration tests for the pg patcher.
 *
 * Skips gracefully (does not fail) if no Postgres is reachable locally — CI
 * provides one via a service container (see .github/workflows/ci.yml) with
 * standard PG* env vars, which `pg`'s Pool/Client read automatically.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Pool } from 'pg';
import { autoInstrument } from '../../../src/core/instrument';
import { isReachable, makeContext, storage } from './helpers';

const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = Number(process.env.PGPORT || 5432);

describe('pg — real database', async () => {
  const reachable = await isReachable(PG_HOST, PG_PORT);
  const d = reachable ? describe : describe.skip;
  if (!reachable) {
    console.warn(`[pg.test.ts] Skipping — no Postgres reachable at ${PG_HOST}:${PG_PORT}`);
  }

  d('with a real Postgres', () => {
    let pool: Pool;
    const TABLE = 'auto_api_observe_test_pg';

    beforeAll(async () => {
      autoInstrument();
      pool = new Pool({ max: 10 });
      await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await pool.query(`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, hits INT DEFAULT 0)`);
      await pool.query(`INSERT INTO ${TABLE} (id, hits) VALUES (1, 0)`);
    });

    it('captures a single query exactly once through Pool.query', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await pool.query(`UPDATE ${TABLE} SET hits = hits + 1 WHERE id = $1`, [1]);
      });
      expect(ctx.dbCallsDetail.calls).toBe(1);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('pg');
      expect(ctx.dbCallsDetail.queries[0].query).toContain('UPDATE');
    });

    it('does NOT double-count pooled queries (Pool internally delegates to Client — regression guard)', async () => {
      const N = 50;
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        const inFlight: Promise<unknown>[] = [];
        for (let i = 0; i < N; i++) {
          inFlight.push(pool.query(`UPDATE ${TABLE} SET hits = hits + 1 WHERE id = $1`, [1]));
          if (inFlight.length >= 10) await Promise.all(inFlight.splice(0, inFlight.length));
        }
        if (inFlight.length) await Promise.all(inFlight);
      });
      // Before the fix, patching both Pool.prototype.query AND
      // Client.prototype.query independently double-counted every pooled
      // query (confirmed empirically: N real queries recorded as 2N).
      expect(ctx.dbCallsDetail.calls).toBe(N);
      expect(ctx.dbCallsDetail.queries).toHaveLength(N);
    });

    it('does not suppress genuinely concurrent sibling queries', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await Promise.all([
          pool.query(`SELECT 1`),
          pool.query(`SELECT 2`),
        ]);
      });
      expect(ctx.dbCallsDetail.calls).toBe(2);
    });
  });
});
