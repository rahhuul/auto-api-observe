import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext, DbCalls, DbQuery, OutboundCall } from '../types';

export const storage = new AsyncLocalStorage<RequestContext>();

export function createDbCalls(): DbCalls {
  return { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] };
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

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

export function trackDbCall(count = 1): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  for (let i = 0; i < count; i++) {
    ctx.dbCallsDetail.calls++;
    ctx.dbCallsDetail.queries.push({ query: '(manual)', source: 'manual', executionTime: new Date().toISOString(), queryTime: 0 });
  }
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

export function addField(key: string, value: unknown): void {
  const ctx = storage.getStore();
  if (ctx) ctx.customFields[key] = value;
}

/** Record a completed outbound HTTP call on the current request context. */
export function recordOutboundCall(call: OutboundCall): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (!ctx.outboundCalls) ctx.outboundCalls = [];
  ctx.outboundCalls.push(call);
}
