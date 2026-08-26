/**
 * Auto-instrumentation for popular Node.js database libraries.
 *
 * Captures per-query details: masked query string, execution time, duration, source.
 *
 * Supported libraries:
 *   - pg (node-postgres)          — Client.query, Pool.query
 *   - mysql2                      — Connection.query/execute, Pool.query/execute
 *   - mongoose / mongodb driver   — Collection methods (find, insertOne, etc.)
 *   - ioredis                     — Commander.sendCommand
 *   - knex                        — Client.query
 *   - prisma (@prisma/client)     — PrismaClient._request
 *   - better-sqlite3              — Database.prepare().run/get/all
 *   - sequelize                   — Sequelize.query
 */

import { AsyncLocalStorage } from 'async_hooks';
import { recordDbQueryOnContext, recordOutboundCall, getContext } from './storage';
import type { DbQuery } from '../types';

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Some ORMs/query-builders (Prisma with a driver adapter, Sequelize, Knex)
 * internally delegate to an already-patched lower-level driver (pg, mysql2)
 * to actually run the query — e.g. Prisma's `_request` calls into the pg
 * adapter, which calls `pg`'s `Client.prototype.query`. Since both layers
 * are independently patched, every such query would otherwise be recorded
 * TWICE. Confirmed empirically at scale for Prisma+pg-adapter, Sequelize+pg,
 * and Knex+pg (20 real queries each recorded as 40).
 *
 * A flat "is anything else in flight" counter would fix that but wrongly
 * suppress genuinely CONCURRENT sibling queries too (e.g. the
 * `Promise.all([pool.query(a), pool.query(b)])` / bounded-parallelism
 * pattern used throughout real bulk-import code) — those aren't nested
 * inside each other, they're independent dispatches from the same caller.
 *
 * A dedicated AsyncLocalStorage instance solves this correctly: `run(true,
 * fn)` marks the ENTIRE async continuation chain that `fn` (here, the
 * delegating call) spawns — including continuations scheduled well after
 * `run()` itself has synchronously returned — while a sibling call
 * dispatched from the same (non-nested) calling code never sees that
 * marker, because it was never scheduled from within that chain. The
 * outermost (semantically meaningful, e.g. "User.update") call wins;
 * anything it recursively delegates into is suppressed.
 */
const suppressNestedRecording = new AsyncLocalStorage<true>();

// ─── Query masking ───────────────────────────────────────────────────────────
// Replaces literal values in SQL with placeholders to avoid logging sensitive data.

function maskSqlValues(sql: string): string {
  return sql
    // Mask quoted strings: 'value' or "value" → '?'
    .replace(/'[^']*'/g, "'?'")
    .replace(/"[^"]*"/g, '"?"')
    // Mask numbers (standalone, not inside identifiers)
    .replace(/\b\d+(\.\d+)?\b/g, '?')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract a query string from common argument patterns. */
function extractQuery(args: unknown[], source: string): string {
  if (!args || args.length === 0) return `(${source})`;

  const first = args[0];

  // pg / mysql2 / knex / sequelize: first arg is the SQL string
  if (typeof first === 'string') {
    return maskSqlValues(first);
  }

  // pg: first arg can be a config object { text: 'SELECT ...' }
  // sequelize (bind-parameterized queries): { query: 'SELECT ...', bind: [...] }
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    if (typeof obj.text === 'string') return maskSqlValues(obj.text);
    if (typeof obj.query === 'string') return maskSqlValues(obj.query);
  }

  // Prisma: first arg is { action: 'findMany', model: 'User', ... }
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    if (obj.action && obj.model) {
      return `${obj.model}.${obj.action}`;
    }
    // Prisma newer versions
    if (obj.clientMethod) {
      return String(obj.clientMethod);
    }
  }

  return `(${source})`;
}

/** Extract query for mongoose collection methods. */
function extractMongoQuery(method: string, args: unknown[]): string {
  const filter = args[0];
  if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
    const keys = Object.keys(filter as Record<string, unknown>);
    if (keys.length > 0) {
      return `${method}({ ${keys.map(k => `${k}: ?`).join(', ')} })`;
    }
  }
  return `${method}()`;
}

// ─── Wrapping helpers ────────────────────────────────────────────────────────

/** Wrap a sync/async/callback-style method to capture query details. Exported for direct unit testing. */
export function wrapMethod(
  obj: Record<string, unknown>,
  method: string,
  source: string,
  queryExtractor?: (args: unknown[]) => string,
): void {
  const original = obj[method];
  if (typeof original !== 'function') return;

  obj[method] = function wrappedDbCall(this: unknown, ...args: unknown[]): unknown {
    const query = queryExtractor
      ? queryExtractor(args)
      : extractQuery(args, source);
    const executionTime = new Date().toISOString();
    const start = performance.now();

    // Capture the request context synchronously, before any deferral to a
    // callback or promise continuation. Pooled drivers (mysql2) dispatch
    // query completion from internal socket I/O callbacks that don't run
    // inside the AsyncLocalStorage scope active when the query was issued,
    // so `storage.getStore()` would return undefined if re-checked later.
    const ctx = getContext();

    // Checked BEFORE this call marks its own scope below — reflects whether
    // *this* call is itself a nested delegation from an already-recording
    // outer call (see suppressNestedRecording above), not whatever this
    // call's own children will see.
    const isNestedDelegation = suppressNestedRecording.getStore() === true;

    let recorded = false;
    const record = (): void => {
      if (recorded) return;
      recorded = true;
      if (isNestedDelegation) return; // an outer delegating call already recorded this query
      recordDbQueryOnContext(ctx, {
        query,
        source,
        executionTime,
        queryTime: Math.round(performance.now() - start),
      });
    };

    // Callback-style call (e.g. mysql2 core `query(sql, values, cb)`): wrap the
    // callback so timing reflects actual completion, not just dispatch.
    const lastArg = args[args.length - 1];
    const hasCallback = typeof lastArg === 'function';
    if (hasCallback) {
      const originalCb = lastArg as AnyFn;
      args[args.length - 1] = function wrappedCallback(this: unknown, ...cbArgs: unknown[]): unknown {
        record();
        return originalCb.apply(this, cbArgs);
      };
    }

    let result: unknown;
    try {
      // Marks this call's entire async continuation chain as "already being
      // recorded" so any nested delegated call into another patched library
      // suppresses itself instead of double-recording the same query.
      result = suppressNestedRecording.run(true, () => (original as AnyFn).apply(this, args));
    } catch (err) {
      record();
      throw err;
    }

    // A strict instanceof check is the safe path — real Promises (the vast
    // majority of promise-returning drivers: pg, mysql2/promise, knex,
    // sequelize, prisma...) always satisfy it, and objects that merely
    // *look* thenable (see below) never do.
    if (result instanceof Promise) {
      return result.then(
        (value) => { record(); return value; },
        (err) => { record(); throw err; },
      );
    }

    // Some libraries return a non-Promise object that merely *looks*
    // thenable, and throws when a caller treats it like one — either via a
    // `.then` getter that throws on property access, or (mysql2's actual
    // behavior) a real `.then()` METHOD whose body throws when CALLED, not
    // when accessed ("You have tried to call .then()... on the result of
    // query that is not a promise"). Neither the property check nor the
    // call itself is safe on its own — both must be guarded.
    let hasThenMethod = false;
    try {
      hasThenMethod = !!result && typeof (result as Record<string, unknown>).then === 'function';
    } catch {
      hasThenMethod = false;
    }

    if (hasThenMethod) {
      try {
        return (result as Promise<unknown>).then(
          (value) => { record(); return value; },
          (err) => { record(); throw err; },
        );
      } catch {
        // Not a real thenable after all — fall through to stream/sync handling.
      }
    }

    // Callback already scheduled to record on completion — don't double-record now.
    if (hasCallback) return result;

    // mysql2's `connection.query(sql).stream()` pattern: no callback, no
    // promise — the command object exposes a `.stream()` method instead.
    // Wrap it so timing reflects when the stream actually finishes (or
    // errors), not when it was merely dispatched.
    let streamMethod: unknown;
    try {
      streamMethod = result && (result as Record<string, unknown>).stream;
    } catch {
      streamMethod = undefined;
    }

    if (typeof streamMethod === 'function') {
      const originalStream = streamMethod as AnyFn;
      (result as Record<string, unknown>).stream = function wrappedStream(this: unknown, ...streamArgs: unknown[]): unknown {
        const streamResult = originalStream.apply(this, streamArgs);
        if (streamResult && typeof (streamResult as Record<string, unknown>).once === 'function') {
          const emitter = streamResult as { once: (event: string, cb: AnyFn) => unknown };
          emitter.once('end', record);
          emitter.once('error', record);
        } else {
          // Can't hook completion — record now rather than never.
          record();
        }
        return streamResult;
      };
      return result;
    }

    // Fully sync result (e.g. better-sqlite3)
    record();
    return result;
  };
}

/** Wrap methods on a prototype. */
function patchPrototype(
  proto: Record<string, unknown> | null | undefined,
  methods: string[],
  source: string,
  queryExtractor?: (method: string) => (args: unknown[]) => string,
): void {
  if (!proto) return;
  for (const m of methods) {
    wrapMethod(proto, m, source, queryExtractor ? queryExtractor(m) : undefined);
  }
}

/** Try to require a module — returns null if not installed. */
function tryRequire(id: string): unknown {
  try {
    require.resolve(id);
    return require(id);
  } catch {
    return null;
  }
}

// ─── Individual library patches ──────────────────────────────────────────────

function patchPg(): boolean {
  const pg = tryRequire('pg') as Record<string, unknown> | null;
  if (!pg) return false;

  const Client = pg.Client as { prototype?: Record<string, unknown> } | undefined;

  // Only patch Client.prototype.query — Pool.prototype.query always
  // internally acquires a Client and calls client.query(...) on it
  // (see pg-pool's `query()`), so patching Pool too would double-count
  // every pooled query (the overwhelmingly common usage pattern).
  // Patching Client alone correctly covers both direct-Client and
  // Pool-based usage since Pool funnels through it either way.
  patchPrototype(Client?.prototype, ['query'], 'pg');
  return true;
}

function patchMysql2(): boolean {
  const mysql2 = tryRequire('mysql2') as Record<string, unknown> | null;
  if (!mysql2) return false;

  const Connection = mysql2.Connection as { prototype?: Record<string, unknown> } | undefined;

  // Only patch Connection.prototype — Pool.prototype.query/execute acquire a
  // PoolConnection (which `extends Connection`) and call query/execute on
  // IT internally (see mysql2's lib/base/pool.js), so patching Pool too
  // double-counts every pooled query — confirmed empirically: a 5,000-query
  // load test through Pool.execute recorded 10,000 calls. Patching
  // Connection alone still correctly covers Pool/PromisePool usage since
  // they always funnel through it.
  patchPrototype(Connection?.prototype, ['query', 'execute'], 'mysql2');
  return true;
}

function patchMongoose(): boolean {
  const mongoose = tryRequire('mongoose') as Record<string, unknown> | null;
  if (!mongoose) return false;

  const Collection = (mongoose as Record<string, unknown>).Collection as
    { prototype?: Record<string, unknown> } | undefined;

  if (!Collection?.prototype) return false;

  const methods = [
    'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'insertOne', 'insertMany',
    'updateOne', 'updateMany',
    'deleteOne', 'deleteMany',
    'aggregate', 'countDocuments', 'estimatedDocumentCount',
    'distinct', 'bulkWrite',
  ];

  patchPrototype(
    Collection.prototype,
    methods,
    'mongoose',
    (method) => (args) => extractMongoQuery(method, args),
  );
  return true;
}

function patchIoredis(): boolean {
  const Redis = tryRequire('ioredis') as { prototype?: Record<string, unknown> } | null;
  if (!Redis?.prototype) return false;

  wrapMethod(
    Redis.prototype,
    'sendCommand',
    'ioredis',
    (args) => {
      const cmd = args[0] as { name?: string } | undefined;
      return cmd?.name ? `REDIS ${cmd.name.toUpperCase()}` : '(ioredis)';
    },
  );
  return true;
}

function patchKnex(): boolean {
  let KnexClient: { prototype?: Record<string, unknown> } | null = null;
  try {
    KnexClient = require('knex/lib/client') as { prototype?: Record<string, unknown> };
  } catch {
    return false;
  }

  if (KnexClient?.prototype) {
    // Client.prototype.query(connection, obj) — the SQL lives on obj.sql in
    // the SECOND argument (the first is just a connection handle), so the
    // generic args[0]-based extractQuery() always falls back to '(knex)'.
    patchPrototype(KnexClient.prototype, ['query'], 'knex', () => (args) => {
      const queryObj = args[1] as Record<string, unknown> | undefined;
      if (queryObj && typeof queryObj.sql === 'string') return maskSqlValues(queryObj.sql);
      return '(knex)';
    });
    return true;
  }
  return false;
}

function patchPrisma(): boolean {
  const PrismaModule = tryRequire('@prisma/client') as Record<string, unknown> | null;
  if (!PrismaModule) return false;

  const PrismaClient = PrismaModule.PrismaClient as { prototype?: Record<string, unknown> } | undefined;
  if (!PrismaClient?.prototype) return false;

  const proto = PrismaClient.prototype;
  if (typeof proto._request === 'function') {
    wrapMethod(proto, '_request', 'prisma');
    return true;
  }
  if (typeof proto._executeRequest === 'function') {
    wrapMethod(proto, '_executeRequest', 'prisma');
    return true;
  }
  return false;
}

function patchSequelize(): boolean {
  const SequelizeModule = tryRequire('sequelize') as Record<string, unknown> | null;
  if (!SequelizeModule) return false;

  const Sequelize = (SequelizeModule.Sequelize ?? SequelizeModule) as
    { prototype?: Record<string, unknown> };

  if (Sequelize?.prototype && typeof Sequelize.prototype.query === 'function') {
    wrapMethod(Sequelize.prototype, 'query', 'sequelize');
    return true;
  }
  return false;
}

function patchBetterSqlite3(): boolean {
  const DatabaseModule = tryRequire('better-sqlite3') as
    (new (...args: unknown[]) => unknown) | null;
  if (!DatabaseModule) return false;

  const proto = (DatabaseModule as unknown as { prototype?: Record<string, unknown> }).prototype;
  if (!proto || typeof proto.prepare !== 'function') return false;

  const originalPrepare = proto.prepare as AnyFn;
  proto.prepare = function wrappedPrepare(this: unknown, ...args: unknown[]): unknown {
    const sql = typeof args[0] === 'string' ? maskSqlValues(args[0]) : '(better-sqlite3)';
    const statement = originalPrepare.apply(this, args) as Record<string, unknown>;

    for (const method of ['run', 'get', 'all', 'iterate']) {
      if (typeof statement[method] === 'function') {
        wrapMethod(statement, method, 'better-sqlite3', () => sql);
      }
    }
    return statement;
  };
  return true;
}

// ─── node-redis (redis package, v4+) ─────────────────────────────────────────

function patchNodeRedis(): boolean {
  const redis = tryRequire('redis') as Record<string, unknown> | null;
  // node-redis v4 exports createClient; bail if not present or already patched
  if (!redis?.createClient || (redis as Record<string, unknown>).__apilens_patched) return false;

  const origCreate = redis.createClient as AnyFn;
  redis.createClient = function patchedCreateClient(...args: unknown[]): unknown {
    const client = origCreate.apply(this, args) as Record<string, unknown>;
    const proto = Object.getPrototypeOf(client) as Record<string, unknown> | null;
    if (proto && !proto.__apilens_redis_patched) {
      // v4: sendCommand(args: string[], options?) — args[0] is string[]
      wrapMethod(proto, 'sendCommand', 'node-redis', (callArgs) => {
        const cmdArr = callArgs[0];
        if (Array.isArray(cmdArr) && cmdArr.length > 0) return `REDIS ${String(cmdArr[0]).toUpperCase()}`;
        return '(node-redis)';
      });
      proto.__apilens_redis_patched = true;
    }
    return client;
  };
  (redis as Record<string, unknown>).__apilens_patched = true;
  return true;
}

// ─── Outbound HTTP — URL masking ─────────────────────────────────────────────

const SENSITIVE_QS = new Set([
  'token', 'api_key', 'apikey', 'key', 'secret', 'password', 'auth',
  'access_token', 'refresh_token', 'client_secret', 'authorization',
]);

function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    let redacted = false;
    url.searchParams.forEach((_, k) => {
      if (SENSITIVE_QS.has(k.toLowerCase())) { url.searchParams.set(k, '[REDACTED]'); redacted = true; }
    });
    return url.origin + url.pathname + (url.search ? url.search : '');
  } catch {
    return raw.slice(0, 500);
  }
}

// ─── Outbound HTTP — axios ────────────────────────────────────────────────────

function patchAxios(): boolean {
  const axios = tryRequire('axios') as Record<string, unknown> | null;
  if (!axios?.interceptors || (axios as Record<string, unknown>).__apilens_patched) return false;

  const interceptors = axios.interceptors as Record<string, { request: Record<string, unknown>; response: Record<string, unknown> }>;

  (interceptors.request as unknown as { use: AnyFn }).use((config: Record<string, unknown>) => {
    config.__apilens_start = performance.now();
    return config;
  });

  (interceptors.response as unknown as { use: AnyFn }).use(
    (response: Record<string, unknown>) => {
      const cfg = response.config as Record<string, unknown> | undefined;
      recordOutboundCall({
        method:  String(cfg?.method ?? 'GET').toUpperCase(),
        url:     maskUrl(String(cfg?.url ?? '')),
        status:  Number((response as Record<string, unknown>).status ?? 0),
        latency: Math.round(performance.now() - Number(cfg?.__apilens_start ?? performance.now())),
      });
      return response;
    },
    (error: Record<string, unknown>) => {
      const cfg = error.config as Record<string, unknown> | undefined;
      recordOutboundCall({
        method:  String(cfg?.method ?? 'GET').toUpperCase(),
        url:     maskUrl(String(cfg?.url ?? '')),
        status:  Number((error.response as Record<string, unknown> | undefined)?.status ?? 0),
        latency: Math.round(performance.now() - Number(cfg?.__apilens_start ?? performance.now())),
      });
      throw error;
    },
  );

  (axios as Record<string, unknown>).__apilens_patched = true;
  return true;
}

// ─── Outbound HTTP — native fetch / undici ────────────────────────────────────

function patchFetch(): boolean {
  if (typeof globalThis.fetch !== 'function') return false;
  if ((globalThis.fetch as AnyFn & { __apilens?: boolean }).__apilens) return false;

  const original = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function patchedFetch(
    input: Parameters<typeof fetch>[0],
    init?:  Parameters<typeof fetch>[1],
  ): Promise<Response> {
    const start  = performance.now();
    const method = (init?.method ?? 'GET').toUpperCase();
    const url    = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url;

    try {
      const res = await original(input, init);
      recordOutboundCall({ method, url: maskUrl(url), status: res.status, latency: Math.round(performance.now() - start) });
      return res;
    } catch (err) {
      recordOutboundCall({ method, url: maskUrl(url), status: 0, latency: Math.round(performance.now() - start) });
      throw err;
    }
  };
  (globalThis.fetch as AnyFn & { __apilens: boolean }).__apilens = true;
  return true;
}

function patchUndici(): boolean {
  const undici = tryRequire('undici') as Record<string, unknown> | null;
  if (!undici?.fetch || (undici.fetch as AnyFn & { __apilens?: boolean }).__apilens) return false;

  const original = undici.fetch as AnyFn;
  undici.fetch = async function patchedUndici(...args: unknown[]): Promise<unknown> {
    const start  = performance.now();
    const input  = args[0];
    const init   = args[1] as Record<string, unknown> | undefined;
    const method = String(init?.method ?? 'GET').toUpperCase();
    const url    = typeof input === 'string' ? input : String((input as Record<string, unknown>)?.href ?? input);

    try {
      const res = await original(...args) as Record<string, unknown>;
      recordOutboundCall({ method, url: maskUrl(url), status: Number(res.status ?? 0), latency: Math.round(performance.now() - start) });
      return res;
    } catch (err) {
      recordOutboundCall({ method, url: maskUrl(url), status: 0, latency: Math.round(performance.now() - start) });
      throw err;
    }
  };
  (undici.fetch as AnyFn & { __apilens: boolean }).__apilens = true;
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface InstrumentResult {
  patched: string[];
  total: number;
}

/**
 * Auto-detect and patch all installed database libraries.
 * Called once when the middleware initializes.
 */
export function autoInstrument(includeOutbound = false): InstrumentResult {
  const patchers: Array<[string, () => boolean]> = [
    ['pg',              patchPg],
    ['mysql2',          patchMysql2],
    ['mongoose',        patchMongoose],
    ['ioredis',         patchIoredis],
    ['knex',            patchKnex],
    ['@prisma/client',  patchPrisma],
    ['sequelize',       patchSequelize],
    ['better-sqlite3',  patchBetterSqlite3],
    ['node-redis',      patchNodeRedis],
  ];

  const patched: string[] = [];

  for (const [name, patch] of patchers) {
    try {
      if (patch()) {
        patched.push(name);
      }
    } catch {
      // Silently skip — instrumentation must never break the app
    }
  }

  if (includeOutbound) {
    try { if (patchAxios())  patched.push('axios');  } catch {}
    try { if (patchFetch())  patched.push('fetch');  } catch {}
    try { if (patchUndici()) patched.push('undici'); } catch {}
  }

  return { patched, total: patched.length };
}
