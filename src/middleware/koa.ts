/**
 * @module
 * Koa middleware for auto-api-observe. Use `koaObservability` as Koa middleware
 * for zero-config request tracing on Koa v2+ applications.
 */
import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Duck-typed Koa context — no runtime koa import needed.
type KoaContext = {
  method:  string;
  path:    string;
  url:     string;
  status:  number;
  request: {
    headers: Record<string, string | string[] | undefined>;
    ip?:     string;
  };
  set: (header: string, value: string) => void;
};
type KoaNext = () => Promise<void>;

export function koaObservability(options: ObservabilityOptions = {}): (ctx: KoaContext, next: KoaNext) => Promise<void> {
  const opts = setup(options);
  if (!opts) return async (_ctx: KoaContext, next: KoaNext) => next();

  return async function koaObservabilityMiddleware(ctx: KoaContext, next: KoaNext): Promise<void> {
    if (shouldSkip(ctx.path, opts.skipRoutes)) { await next(); return; }

    const incoming = ctx.request.headers[opts.traceHeader];
    const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    ctx.set(opts.traceHeader, traceId);
    if (opts.onRequest) opts.onRequest(context);

    // If downstream middleware throws, `next()` rejects and Koa's own
    // top-level handler sets the response status via ctx.app.emit('error')
    // — which runs AFTER this middleware has already unwound. Without
    // catching here, the entry never gets built/logged at all for any
    // request that errors, which is exactly the case observability matters
    // most for. Catch, log using the status Koa will actually send
    // (err.status/statusCode, same fallback Koa's default onerror uses),
    // then re-throw so Koa's normal error handling and response are
    // completely unaffected.
    let caughtErr: unknown;
    try {
      await storage.run(context, async () => { await next(); });
    } catch (err) {
      caughtErr = err;
    }

    const ua     = ctx.request.headers['user-agent'];
    const ip     = ctx.request.ip ?? 'unknown';
    const status = caughtErr
      ? Number((caughtErr as { status?: number; statusCode?: number }).status
          ?? (caughtErr as { statusCode?: number }).statusCode
          ?? 500)
      : ctx.status;
    const entry  = buildEntry(opts, context, ctx.method, ctx.path, ctx.url, status, ip, Array.isArray(ua) ? ua[0] : ua);
    finalize(opts, entry);

    if (caughtErr) throw caughtErr;
  };
}
