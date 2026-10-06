import { describe, it, expect } from 'vitest';
import { storage, getContext, trackDbCall, recordDbQuery, createDbCalls } from '../../src/core/storage';
import { autoInstrument } from '../../src/core/instrument';
import type { RequestContext } from '../../src/types';

function makeContext(): RequestContext {
  return { traceId: 'trace-inst', startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

describe('autoInstrument', () => {
  it('returns an InstrumentResult with patched array', () => {
    const result = autoInstrument();
    expect(result).toHaveProperty('patched');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.patched)).toBe(true);
    expect(result.total).toBe(result.patched.length);
  });

  it('does not throw when no DB libraries are installed', () => {
    expect(() => autoInstrument()).not.toThrow();
  });
});

describe('trackDbCall with rich context', () => {
  it('increments calls and creates manual entries', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      trackDbCall();
      trackDbCall();
      expect(ctx.dbCallsDetail.calls).toBe(2);
      expect(ctx.dbCallsDetail.queries).toHaveLength(2);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('manual');
      expect(ctx.dbCallsDetail.queries[0].query).toBe('(manual)');
    });
  });

  it('counts calls across async boundaries', async () => {
    const ctx = makeContext();
    await storage.run(ctx, async () => {
      trackDbCall();
      await new Promise((resolve) => setTimeout(resolve, 5));
      trackDbCall();
      await (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        trackDbCall();
      })();
      expect(ctx.dbCallsDetail.calls).toBe(3);
      expect(ctx.dbCalls).toBe(3);
    });
  });

  it('counts calls from nested function calls', () => {
    const ctx = makeContext();
    function simulateDbQuery() { trackDbCall(); }
    function serviceLayer() { simulateDbQuery(); simulateDbQuery(); }

    storage.run(ctx, () => {
      serviceLayer();
      expect(ctx.dbCallsDetail.calls).toBe(2);
    });
  });

  it('isolates counts between concurrent requests', async () => {
    const ctx1 = makeContext();
    const ctx2 = makeContext();

    const p1 = storage.run(ctx1, async () => {
      trackDbCall();
      await new Promise((resolve) => setTimeout(resolve, 10));
      trackDbCall();
    });
    const p2 = storage.run(ctx2, async () => {
      trackDbCall();
      trackDbCall();
      trackDbCall();
    });

    await Promise.all([p1, p2]);
    expect(ctx1.dbCallsDetail.calls).toBe(2);
    expect(ctx2.dbCallsDetail.calls).toBe(3);
  });
});

describe('recordDbQuery', () => {
  it('captures query string, source, timing, and computes aggregates', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      recordDbQuery({
        query: 'SELECT * FROM users WHERE id = ?',
        source: 'pg',
        executionTime: '2026-03-17T12:00:00.000Z',
        queryTime: 150,
      });
      recordDbQuery({
        query: 'SELECT * FROM orders WHERE user_id = ?',
        source: 'pg',
        executionTime: '2026-03-17T12:00:00.150Z',
        queryTime: 122,
      });

      const db = ctx.dbCallsDetail;
      expect(db.calls).toBe(2);
      expect(db.totalTime).toBe(272);
      expect(db.slowestQuery).toBe(150);
      expect(db.queries).toHaveLength(2);
      expect(db.queries[0].query).toBe('SELECT * FROM users WHERE id = ?');
      expect(db.queries[0].source).toBe('pg');
      expect(db.queries[0].queryTime).toBe(150);
      expect(db.queries[1].queryTime).toBe(122);
    });
  });

  it('keeps legacy dbCalls counter in sync', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      recordDbQuery({ query: 'q1', source: 'pg', executionTime: '', queryTime: 10 });
      recordDbQuery({ query: 'q2', source: 'pg', executionTime: '', queryTime: 20 });
      expect(ctx.dbCalls).toBe(2);
    });
  });

  it('tracks slowestQuery correctly', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      recordDbQuery({ query: 'fast', source: 'pg', executionTime: '', queryTime: 5 });
      recordDbQuery({ query: 'slow', source: 'pg', executionTime: '', queryTime: 500 });
      recordDbQuery({ query: 'medium', source: 'pg', executionTime: '', queryTime: 50 });
      expect(ctx.dbCallsDetail.slowestQuery).toBe(500);
    });
  });
});

// Drizzle has no dedicated patcher — it's captured transparently because
// drizzle-orm/better-sqlite3 (like node-postgres and mysql2) calls straight
// into the already-patched driver method. This test exists to (a) lock that
// behavior in against regressions and (b) catch the real maskSqlValues bug
// this uncovered: double-quoted SQL identifiers ("users", "id" — how
// Postgres/SQLite quote column/table names) were being masked as if they
// were string literals, turning every Drizzle-generated query into
// `select "?", "?" from "?"`.
describe('Drizzle ORM (via better-sqlite3)', () => {
  it('captures a real query with correct text, source, and timing', async () => {
    autoInstrument(false, false);

    const Database = require('better-sqlite3');
    const { drizzle } = require('drizzle-orm/better-sqlite3');
    const { sqliteTable, integer, text } = require('drizzle-orm/sqlite-core');

    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
    sqlite.exec("INSERT INTO users (id, name) VALUES (1, 'Alice')");

    const users = sqliteTable('users', { id: integer('id').primaryKey(), name: text('name') });
    const db = drizzle(sqlite);

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      const rows = await db.select().from(users);
      expect(rows).toEqual([{ id: 1, name: 'Alice' }]);

      const captured = getContext()!.dbCallsDetail;
      expect(captured.calls).toBe(1);
      expect(captured.queries[0].source).toBe('better-sqlite3');
      // The real regression check: identifiers must survive untouched.
      expect(captured.queries[0].query).toBe('select "id", "name" from "users"');
    });
  });
});
