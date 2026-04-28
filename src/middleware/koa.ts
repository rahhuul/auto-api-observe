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

    await storage.run(context, async () => { await next(); });

    const ua    = ctx.request.headers['user-agent'];
    const ip    = ctx.request.ip ?? 'unknown';
    const entry = buildEntry(opts, context, ctx.method, ctx.path, ctx.url, ctx.status, ip, Array.isArray(ua) ? ua[0] : ua);
    finalize(opts, entry);
  };
}
