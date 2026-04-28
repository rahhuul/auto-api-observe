import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext, DbCalls, DbQuery, OutboundCall } from '../types';

export const storage = new AsyncLocalStorage<RequestContext>();

/** Creates an empty {@link DbCalls} accumulator for a new request context. */
export function createDbCalls(): DbCalls {
  return { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] };
}

/** Returns the active {@link RequestContext} for the current async call stack, or `undefined` if called outside a request. */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Records a completed DB query on the current request context. Used by auto-instrumentation and the manual `recordDbQuery` helper. */
export function recordDbQuery(query: DbQuery): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.dbCallsDetail.calls++;
  ctx.dbCallsDetail.totalTime += query.queryTime;
  if (query.queryTime > ctx.dbCallsDetail.slowestQuery) {
    ctx.dbCallsDetail.slowestQuery = query.queryTime;
  }
  ctx.dbCallsDetail.queries.push(query);
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

/** Manually increments the DB call counter for the current request. Use when auto-instrumentation cannot patch the library. */
export function trackDbCall(count = 1): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  for (let i = 0; i < count; i++) {
    ctx.dbCallsDetail.calls++;
    ctx.dbCallsDetail.queries.push({ query: '(manual)', source: 'manual', executionTime: new Date().toISOString(), queryTime: 0 });
  }
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

/** Attaches a custom key/value field to the current request's log entry. Sensitive keys are automatically redacted before shipping. */
export function addField(key: string, value: unknown): void {
  const ctx = storage.getStore();
  if (ctx) ctx.customFields[key] = value;
}

/** Records a completed outbound HTTP call on the current request context. */
export function recordOutboundCall(call: OutboundCall): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (!ctx.outboundCalls) ctx.outboundCalls = [];
  ctx.outboundCalls.push(call);
}
