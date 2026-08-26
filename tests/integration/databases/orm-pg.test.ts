/**
 * Real-Postgres regression tests for the cross-library double-counting fix:
 * Sequelize and Knex both internally delegate to the already-patched `pg`
 * driver to actually run a query, so both layers independently recording it
 * would double-count every query (confirmed empirically at 20-query scale:
 * 20 real queries recorded as 40, for both Sequelize+pg and Knex+pg).
 *
 * Prisma-with-driver-adapter hits the exact same mechanism but needs a
 * generated client + schema to test for real — that specific case is
 * covered by a synthetic reproduction in tests/unit/wrap-method.test.ts
 * ("does not double-count when an ORM delegates asynchronously..."), and
 * was manually verified against a real Prisma + @prisma/adapter-pg setup
 * during development.
 *
 * Skips gracefully (does not fail) if no Postgres is reachable locally.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import Knex from 'knex';
import { autoInstrument } from '../../../src/core/instrument';
import { isReachable, makeContext, storage } from './helpers';

const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = Number(process.env.PGPORT || 5432);
const PG_USER = process.env.PGUSER || 'postgres';
const PG_PASSWORD = process.env.PGPASSWORD || 'postgres';
const PG_DATABASE = process.env.PGDATABASE || 'postgres';
const CONN_STRING = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}`;

describe('ORM → pg delegation — real database', async () => {
  const reachable = await isReachable(PG_HOST, PG_PORT);
  const d = reachable ? describe : describe.skip;
  if (!reachable) {
    console.warn(`[orm-pg.test.ts] Skipping — no Postgres reachable at ${PG_HOST}:${PG_PORT}`);
  }

  d('with a real Postgres', () => {
    beforeAll(() => {
      autoInstrument();
    });

    it('Sequelize + pg dialect: does not double-count (regression guard)', async () => {
      const sequelize = new Sequelize(CONN_STRING, { logging: false });
      const Model = sequelize.define('AutoApiObserveTestSeq', { name: DataTypes.STRING });
      await Model.sync({ force: true });

      const N = 15;
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        for (let i = 0; i < N; i++) await Model.create({ name: `n${i}` });
      });

      expect(ctx.dbCallsDetail.calls).toBe(N);
      expect(new Set(ctx.dbCallsDetail.queries.map((q) => q.source))).toEqual(new Set(['sequelize']));

      await Model.drop();
      await sequelize.close();
    });

    it('Knex + pg dialect: does not double-count (regression guard)', async () => {
      const knex = Knex({ client: 'pg', connection: CONN_STRING });
      const TABLE = 'auto_api_observe_test_knex';
      await knex.schema.dropTableIfExists(TABLE);
      await knex.schema.createTable(TABLE, (t) => { t.increments('id'); t.string('name'); });

      const N = 15;
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        for (let i = 0; i < N; i++) await knex(TABLE).insert({ name: `n${i}` });
      });

      expect(ctx.dbCallsDetail.calls).toBe(N);
      expect(new Set(ctx.dbCallsDetail.queries.map((q) => q.source))).toEqual(new Set(['knex']));

      await knex.schema.dropTableIfExists(TABLE);
      await knex.destroy();
    });

    it('does not suppress genuinely concurrent sibling queries across delegation', async () => {
      const sequelize = new Sequelize(CONN_STRING, { logging: false });
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await Promise.all([
          sequelize.query('SELECT 1'),
          sequelize.query('SELECT 2'),
        ]);
      });
      expect(ctx.dbCallsDetail.calls).toBe(2);
      await sequelize.close();
    });
  });
});
