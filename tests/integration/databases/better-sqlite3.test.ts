/**
 * better-sqlite3 integration test. No external service needed (embedded,
 * in-memory) so this always runs, no reachability gate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { autoInstrument } from '../../../src/core/instrument';
import { makeContext, storage } from './helpers';

// better-sqlite3@13 declares `engines.node: >=22` — its N-API binding
// reliably segfaults (not just a warning) when loaded under Node 18 or 20.
// Confirmed via a clean install (no --ignore-scripts) in fresh Node 18 and
// Node 20 containers: both crash with SIGSEGV; Node 22 works. This is a
// test-infra-only constraint — better-sqlite3 is a devDependency used only
// to exercise src/core/instrument.ts's patcher, so running this file once
// on Node 22 (already in the CI matrix) gives full coverage of that code
// path without needing every Node version to load the native binary.
//
// The import above is type-only and erased at compile time — the actual
// module is loaded dynamically inside beforeAll below, so describe.skipIf
// genuinely prevents the native binary from ever being loaded on Node <22.
// A static `import Database from 'better-sqlite3'` at the top of the file
// would run before skipIf takes effect and crash the worker regardless.
const nodeMajor = Number(process.versions.node.split('.')[0]);

describe.skipIf(nodeMajor < 22)('better-sqlite3', () => {
  let db: Database.Database;

  beforeAll(async () => {
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    autoInstrument();
    db = new BetterSqlite3(':memory:');
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
