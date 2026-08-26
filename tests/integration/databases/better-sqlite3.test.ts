/**
 * better-sqlite3 integration test. No external service needed (embedded,
 * in-memory) so this always runs, no reachability gate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { autoInstrument } from '../../../src/core/instrument';
import { makeContext, storage } from './helpers';

describe('better-sqlite3', () => {
  let db: Database.Database;

  beforeAll(() => {
    autoInstrument();
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
  });

  // Leaving the native handle open until process exit is part of what makes
  // better-sqlite3 sensitive to worker-thread teardown ordering — see the
  // `pool: 'forks'` note in vitest.config.ts.
  afterAll(() => { db.close(); });

  it('captures run/get/all exactly once each, with correct source', async () => {
    const ctx = makeContext();
    await storage.run(ctx, () => {
      db.prepare('INSERT INTO t (name) VALUES (?)').run('alice');
      db.prepare('SELECT * FROM t WHERE name = ?').get('alice');
      db.prepare('SELECT * FROM t').all();
    });
    expect(ctx.dbCallsDetail.calls).toBe(3);
    expect(ctx.dbCallsDetail.queries.every((q) => q.source === 'better-sqlite3')).toBe(true);
  });
});
