import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext, DbCalls, DbQuery, OutboundCall } from '../types';

export const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Safety backstop on how many individual queries are kept per request —
 * NOT the primary mechanism that keeps shipped payloads small. That's the
 * ingest endpoint's raised body-size limit (5MB) plus `RemoteShipper`'s
 * byte-size-based batch splitting. This ceiling exists only to guarantee a
 * single request's own entry can never itself exceed that limit even in a
 * pathological case (a runaway loop issuing far more queries than any real
 * bulk-import/batch-update workload would): measured real-world size is
 * ~203 bytes/query (a 5,911-row bulk import ships as ~1.1MB), so 15,000
 * queries caps a single entry at ~3MB — comfortably under the 5MB ingest
 * limit with headroom for the rest of the event's fields — while sitting far
 * above any realistic single-request query count. Aggregates (`calls`,
 * `totalTime`, `slowestQuery`) always reflect every query regardless of
 * this cap.
 */
const MAX_QUERIES_PER_REQUEST = 15_000;

/** Creates an empty {@link DbCalls} accumulator for a new request context. */
export function createDbCalls(): DbCalls {
  return { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] };
}

/** Returns the active {@link RequestContext} for the current async call stack, or `undefined` if called outside a request. */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Records a completed DB query on an explicitly-provided context.
 *
 * Auto-instrumentation for pooled/multiplexed drivers (e.g. mysql2) must
 * capture the context synchronously at call time (via {@link getContext})
 * and pass it here when the query actually completes — the driver's internal
 * socket I/O callback often runs outside the AsyncLocalStorage scope that was
 * active when the query was dispatched (the pool's socket listeners were
 * bound once at pool-creation time, not per-request), so calling
 * `storage.getStore()` again from inside that callback would return
 * `undefined` and silently drop the query.
 */
export function recordDbQueryOnContext(ctx: RequestContext | undefined, query: DbQuery): void {
  if (!ctx) return;
  ctx.dbCallsDetail.calls++;
  ctx.dbCallsDetail.totalTime += query.queryTime;
  if (query.queryTime > ctx.dbCallsDetail.slowestQuery) {
    ctx.dbCallsDetail.slowestQuery = query.queryTime;
  }
  if (ctx.dbCallsDetail.queries.length < MAX_QUERIES_PER_REQUEST) {
    ctx.dbCallsDetail.queries.push(query);
  }
  ctx.dbCalls = ctx.dbCallsDetail.calls;
}

/** Records a completed DB query on the current request context. Used by manual instrumentation via `recordDbQuery`. */
export function recordDbQuery(query: DbQuery): void {
  recordDbQueryOnContext(storage.getStore(), query);
}

/** Manually increments the DB call counter for the current request. Use when auto-instrumentation cannot patch the library. */
export function trackDbCall(count = 1): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  for (let i = 0; i < count; i++) {
    ctx.dbCallsDetail.calls++;
    if (ctx.dbCallsDetail.queries.length < MAX_QUERIES_PER_REQUEST) {
      ctx.dbCallsDetail.queries.push({ query: '(manual)', source: 'manual', executionTime: new Date().toISOString(), queryTime: 0 });
    }
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
