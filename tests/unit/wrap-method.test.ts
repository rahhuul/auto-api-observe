import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { wrapMethod } from '../../src/core/instrument';
import { storage, createDbCalls } from '../../src/core/storage';
import type { RequestContext } from '../../src/types';

function makeContext(): RequestContext {
  return { traceId: 'trace-wrap', startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

describe('wrapMethod', () => {
  it('records actual completion time for callback-style calls, not dispatch time', async () => {
    const target: Record<string, unknown> = {
      query(_sql: string, cb: (err: null, rows: unknown[]) => void) {
        // Simulate a real async DB round-trip — completion happens well after dispatch returns.
        setTimeout(() => cb(null, [{ id: 1 }]), 30);
        return { fakeCommandObject: true }; // mysql2-style: always returns a command object
      },
    };
    wrapMethod(target, 'query', 'mysql2');

    const ctx = makeContext();
    await storage.run(ctx, () => new Promise<void>((resolve) => {
      (target.query as (sql: string, cb: (err: null, rows: unknown[]) => void) => unknown)(
        'SELECT 1',
        () => resolve()
      );
    }));

    expect(ctx.dbCallsDetail.calls).toBe(1);
    expect(ctx.dbCallsDetail.queries[0].queryTime).toBeGreaterThanOrEqual(25);
  });

  it('still records when the driver invokes the callback from outside the AsyncLocalStorage scope (pooled-connection simulation)', async () => {
    // Simulates mysql2's connection pool: the socket that eventually invokes
    // the query callback was set up once, outside any request's context, so
    // by the time it fires, storage.getStore() would return undefined if
    // re-checked at that point.
    let deferredCb: (() => void) | null = null;
    const target: Record<string, unknown> = {
      execute(_sql: string, cb: () => void) {
        deferredCb = cb; // simulate the pool queuing the callback for later dispatch
        return { fakeCommandObject: true };
      },
    };
    wrapMethod(target, 'execute', 'mysql2');

    const ctx = makeContext();
    storage.run(ctx, () => {
      (target.execute as (sql: string, cb: () => void) => unknown)('UPDATE t SET x = 1', () => {});
    });

    // storage.run() has already returned — we're now fully outside any ALS scope.
    expect(storage.getStore()).toBeUndefined();
    deferredCb!();

    expect(ctx.dbCallsDetail.calls).toBe(1);
    expect(ctx.dbCallsDetail.queries).toHaveLength(1);
  });

  it('records completion time from a `.stream()`-consumed command (mysql2 `query(sql).stream()` pattern), not dispatch time', async () => {
    const target: Record<string, unknown> = {
      query(_sql: string) {
        return {
          stream() {
            const emitter = new EventEmitter();
            setTimeout(() => {
              emitter.emit('data', { id: 1 });
              emitter.emit('end');
            }, 25);
            return emitter;
          },
        };
      },
    };
    wrapMethod(target, 'query', 'mysql2');

    const ctx = makeContext();
    await storage.run(ctx, () => new Promise<void>((resolve) => {
      const command = (target.query as (sql: string) => { stream: () => EventEmitter })('SELECT * FROM t');
      // Nothing should be recorded yet — dispatch alone shouldn't count as completion.
      expect(ctx.dbCallsDetail.calls).toBe(0);
      const stream = command.stream();
      stream.on('end', () => resolve());
    }));

    expect(ctx.dbCallsDetail.calls).toBe(1);
    expect(ctx.dbCallsDetail.queries[0].queryTime).toBeGreaterThanOrEqual(20);
  });

  it('records on stream error too, and only once even if both end and error could fire', async () => {
    const target: Record<string, unknown> = {
      query(_sql: string) {
        return {
          stream() {
            const emitter = new EventEmitter();
            setTimeout(() => emitter.emit('error', new Error('connection lost')), 10);
            return emitter;
          },
        };
      },
    };
    wrapMethod(target, 'query', 'mysql2');

    const ctx = makeContext();
    await storage.run(ctx, () => new Promise<void>((resolve) => {
      const command = (target.query as (sql: string) => { stream: () => EventEmitter })('SELECT * FROM t');
      const stream = command.stream();
      stream.on('error', () => resolve());
    }));

    expect(ctx.dbCallsDetail.calls).toBe(1);
  });

  it('does not throw when the return value has a throwing `then` getter', async () => {
    const target: Record<string, unknown> = {
      query(_sql: string, cb: (err: null) => void) {
        const command: Record<string, unknown> = {};
        Object.defineProperty(command, 'then', {
          get() { throw new Error('You have tried to call .then() on the result of query that is not a Promise.'); },
        });
        setTimeout(() => cb(null), 5);
        return command;
      },
    };
    wrapMethod(target, 'query', 'mysql2');

    const ctx = makeContext();
    await storage.run(ctx, () => new Promise<void>((resolve) => {
      expect(() => {
        (target.query as (sql: string, cb: (err: null) => void) => unknown)('SELECT 1', () => resolve());
      }).not.toThrow();
    }));

    expect(ctx.dbCallsDetail.calls).toBe(1);
  });

  it('does not throw when `.then` is a real METHOD that throws on invocation (actual mysql2 core behavior)', async () => {
    // This is what mysql2's core Query object actually does — `.then` is a
    // plain callable method (not a getter) whose body throws immediately:
    // "You have tried to call .then()... on the result of query that is
    // not a promise". A naive `typeof result.then === 'function'` check
    // passes cleanly here, so the CALL itself must be guarded too.
    const target: Record<string, unknown> = {
      query(_sql: string) {
        return {
          then() {
            throw new Error('You have tried to call .then()... on the result of query that is not a promise.');
          },
          stream() {
            const emitter = new EventEmitter();
            setTimeout(() => emitter.emit('end'), 5);
            return emitter;
          },
        };
      },
    };
    wrapMethod(target, 'query', 'mysql2');

    const ctx = makeContext();
    await storage.run(ctx, () => new Promise<void>((resolve) => {
      let command: { stream: () => EventEmitter } | undefined;
      expect(() => {
        command = (target.query as (sql: string) => { stream: () => EventEmitter })('SELECT 1');
      }).not.toThrow();
      const stream = command!.stream();
      stream.on('end', () => resolve());
    }));

    expect(ctx.dbCallsDetail.calls).toBe(1);
  });

  it('still records promise-style calls correctly', async () => {
    const target: Record<string, unknown> = {
      query: async (_sql: string) => {
        await new Promise((r) => setTimeout(r, 10));
        return [{ id: 1 }];
      },
    };
    wrapMethod(target, 'query', 'pg');

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      await (target.query as (sql: string) => Promise<unknown>)('SELECT 1');
    });

    expect(ctx.dbCallsDetail.calls).toBe(1);
    expect(ctx.dbCallsDetail.queries[0].queryTime).toBeGreaterThanOrEqual(5);
  });

  it('still records fully synchronous calls correctly (e.g. better-sqlite3)', () => {
    const target: Record<string, unknown> = {
      run: (_sql: string) => ({ changes: 1 }),
    };
    wrapMethod(target, 'run', 'better-sqlite3');

    const ctx = makeContext();
    storage.run(ctx, () => {
      (target.run as (sql: string) => unknown)('INSERT INTO t VALUES (1)');
    });

    expect(ctx.dbCallsDetail.calls).toBe(1);
  });

  it('records failed sync calls and rethrows', () => {
    const target: Record<string, unknown> = {
      run: () => { throw new Error('boom'); },
    };
    wrapMethod(target, 'run', 'better-sqlite3');

    const ctx = makeContext();
    storage.run(ctx, () => {
      expect(() => (target.run as () => unknown)()).toThrow('boom');
    });

    expect(ctx.dbCallsDetail.calls).toBe(1);
  });

  it('does not double-count when a Pool delegates to a Connection subclass that is also patched (pg/mysql2 pattern)', async () => {
    // pg's Pool.query and mysql2's Pool.query/execute both internally
    // acquire a pooled-connection instance (which extends the base
    // Connection/Client class) and call the SAME method name on it. Patching
    // both the Pool class and the base Connection/Client class — as
    // patchPg()/patchMysql2() used to — double-counts every pooled call,
    // confirmed at real scale against live pg and mysql2 servers (5,000
    // queries recorded as 10,000). The fix is to patch only the base class,
    // since Pool always funnels through it regardless.
    class FakeConnection {
      async execute(_sql: string) { return { rows: [] }; }
    }
    class FakePoolConnection extends FakeConnection {}
    class FakePool {
      async execute(sql: string) {
        const conn = new FakePoolConnection();
        return conn.execute(sql); // mirrors pg-pool / mysql2 base/pool.js delegating to a Connection subclass
      }
    }

    // Only the base class gets patched — mirrors the fixed patchPg/patchMysql2.
    wrapMethod(FakeConnection.prototype as unknown as Record<string, unknown>, 'execute', 'fake-db');

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      const pool = new FakePool();
      await pool.execute('SELECT 1');
      await pool.execute('SELECT 2');
    });

    expect(ctx.dbCallsDetail.calls).toBe(2);
    expect(ctx.dbCallsDetail.queries).toHaveLength(2);
  });

  it('does not double-count when an ORM delegates asynchronously into another patched library (Prisma+adapter/Sequelize/Knex → pg pattern)', async () => {
    // Simulates e.g. Prisma's _request calling into the pg adapter, which
    // calls pg's Client.prototype.query — both independently patched.
    // Critically, the inner call happens on a LATER tick (a real await),
    // not synchronously nested — confirmed empirically at scale (20 real
    // Sequelize+pg / Knex+pg / Prisma+adapter queries each recorded as 40
    // before this fix).
    const innerDriver: Record<string, unknown> = {
      async query(_sql: string) {
        await new Promise((r) => setTimeout(r, 5));
        return { rows: [] };
      },
    };
    wrapMethod(innerDriver, 'query', 'pg');

    const orm: Record<string, unknown> = {
      async request(_op: string) {
        // The ORM does its own async setup before delegating — this is why
        // a simple synchronous depth counter wouldn't work here.
        await new Promise((r) => setTimeout(r, 2));
        return (innerDriver.query as (sql: string) => Promise<unknown>)('SELECT 1');
      },
    };
    wrapMethod(orm, 'request', 'orm');

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      await (orm.request as (op: string) => Promise<unknown>)('User.findMany');
    });

    expect(ctx.dbCallsDetail.calls).toBe(1);
    expect(ctx.dbCallsDetail.queries).toHaveLength(1);
    // The outer (semantic) call wins, not the inner raw-driver call.
    expect(ctx.dbCallsDetail.queries[0].source).toBe('orm');
  });

  it('does NOT suppress genuinely concurrent sibling calls (Promise.all / bounded-parallelism pattern)', async () => {
    // These two calls are dispatched side-by-side from the same caller —
    // neither is nested inside the other — so both must still be recorded.
    // This is the exact pattern real bulk-import code uses (PARALLEL_LIMIT
    // batches of concurrent pool.execute() calls).
    const driver: Record<string, unknown> = {
      async query(_sql: string) {
        await new Promise((r) => setTimeout(r, 5));
        return { rows: [] };
      },
    };
    wrapMethod(driver, 'query', 'pg');

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      await Promise.all([
        (driver.query as (sql: string) => Promise<unknown>)('SELECT 1'),
        (driver.query as (sql: string) => Promise<unknown>)('SELECT 2'),
      ]);
    });

    expect(ctx.dbCallsDetail.calls).toBe(2);
    expect(ctx.dbCallsDetail.queries).toHaveLength(2);
  });
});
