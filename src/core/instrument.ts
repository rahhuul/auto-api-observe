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

import { recordDbQuery } from './storage';
import type { DbQuery } from '../types';

type AnyFn = (...args: unknown[]) => unknown;

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
  if (first && typeof first === 'object' && 'text' in (first as Record<string, unknown>)) {
    const text = (first as Record<string, unknown>).text;
    if (typeof text === 'string') return maskSqlValues(text);
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

/** Wrap a sync/async method to capture query details. */
function wrapMethod(
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

    let result: unknown;
    try {
      result = (original as AnyFn).apply(this, args);
    } catch (err) {
      // Record even failed sync queries
      recordDbQuery({
        query,
        source,
        executionTime,
        queryTime: Math.round(performance.now() - start),
      });
      throw err;
    }

    // Handle promises (async queries)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).then(
        (value) => {
          recordDbQuery({
            query,
            source,
            executionTime,
            queryTime: Math.round(performance.now() - start),
          });
          return value;
        },
        (err) => {
          recordDbQuery({
            query,
            source,
            executionTime,
            queryTime: Math.round(performance.now() - start),
          });
          throw err;
        },
      );
    }

    // Sync result (e.g. better-sqlite3)
    recordDbQuery({
      query,
      source,
      executionTime,
      queryTime: Math.round(performance.now() - start),
    });
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
  const Pool = pg.Pool as { prototype?: Record<string, unknown> } | undefined;

  patchPrototype(Client?.prototype, ['query'], 'pg');
  patchPrototype(Pool?.prototype, ['query'], 'pg');
  return true;
}

function patchMysql2(): boolean {
  const mysql2 = tryRequire('mysql2') as Record<string, unknown> | null;
  if (!mysql2) return false;

  const Connection = mysql2.Connection as { prototype?: Record<string, unknown> } | undefined;
  const Pool = mysql2.Pool as { prototype?: Record<string, unknown> } | undefined;

  patchPrototype(Connection?.prototype, ['query', 'execute'], 'mysql2');
  patchPrototype(Pool?.prototype, ['query', 'execute'], 'mysql2');
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
    patchPrototype(KnexClient.prototype, ['query'], 'knex');
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

// ─── Public API ──────────────────────────────────────────────────────────────

export interface InstrumentResult {
  patched: string[];
  total: number;
}

/**
 * Auto-detect and patch all installed database libraries.
 * Called once when the middleware initializes.
 */
export function autoInstrument(): InstrumentResult {
  const patchers: Array<[string, () => boolean]> = [
    ['pg', patchPg],
    ['mysql2', patchMysql2],
    ['mongoose', patchMongoose],
    ['ioredis', patchIoredis],
    ['knex', patchKnex],
    ['@prisma/client', patchPrisma],
    ['sequelize', patchSequelize],
    ['better-sqlite3', patchBetterSqlite3],
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

  return { patched, total: patched.length };
}
