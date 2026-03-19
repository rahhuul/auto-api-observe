import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext, DbCalls, DbQuery } from '../types';

export const storage = new AsyncLocalStorage<RequestContext>();

/** Create a fresh DbCalls object for a new request. */
export function createDbCalls(): DbCalls {
  return { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] };
}

/**
 * Returns the RequestContext for the currently executing async chain,
 * or `undefined` when called outside a tracked request.
 */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Record a completed DB query with full details.
 * Called by auto-instrumentation after a query finishes.
 * Safe to call from anywhere — no-ops outside a tracked request.
 */
export function recordDbQuery(query: DbQuery): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.dbCallsDetail.calls++;
  ctx.dbCallsDetail.totalTime += query.queryTime;
  if (query.queryTime > ctx.dbCallsDetail.slowestQuery) {
    ctx.dbCallsDetail.slowestQuery = query.queryTime;
  }
  ctx.dbCallsDetail.queries.push(query);
  // Keep legacy counter in sync
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

/**
 * Increment the DB-call counter for the current request.
 * For manual use when auto-instrumentation can't capture the query.
 * Safe to call from anywhere — no-ops outside a tracked request.
 */
export function trackDbCall(count = 1): void {
  const ctx = storage.getStore();
  if (!ctx) return;

  for (let i = 0; i < count; i++) {
    const query: DbQuery = {
      query: '(manual)',
      source: 'manual',
      executionTime: new Date().toISOString(),
      queryTime: 0,
    };
    ctx.dbCallsDetail.calls++;
    ctx.dbCallsDetail.queries.push(query);
  }
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

/**
 * Attach arbitrary key/value pairs to the current request's log entry.
 * Safe to call from anywhere — no-ops outside a tracked request.
 *
 * @example
 * addField('userId', req.user.id);
 * addField('plan', 'pro');
 */
export function addField(key: string, value: unknown): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.customFields[key] = value;
  }
}
