/**
 * @module
 * Hono middleware for auto-api-observe. Use `honoObservability` with Hono v3/v4
 * for zero-config request tracing including Edge and Cloudflare Workers.
 */
import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Duck-typed Hono context — compatible with Hono v3 and v4.
type HonoContext = {
  req: {
    method:  string;
    path:    string;
    url:     string;
    header:  (name: string) => string | undefined;
    raw:     { headers?: { get?: (k: string) => string | null } };
  };
  res:    Response;
  header: (name: string, value: string) => void;
};
type HonoNext = () => Promise<Response | void>;

export function honoObservability(options: ObservabilityOptions = {}): (c: HonoContext, next: HonoNext) => Promise<Response | void> {
  const opts = setup(options);
  if (!opts) return async (_c: HonoContext, next: HonoNext) => next();

  return async function honoObservabilityMiddleware(c: HonoContext, next: HonoNext): Promise<Response | void> {
    const path = (() => { try { return new URL(c.req.url).pathname; } catch { return c.req.path; } })();
    if (shouldSkip(path, opts.skipRoutes)) return next();

    const traceId = c.req.header(opts.traceHeader) ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    c.header(opts.traceHeader, traceId);
    if (opts.onRequest) opts.onRequest(context);

    let status = 200;
    await storage.run(context, async () => {
      await next();
      status = c.res?.status ?? 200;
    });

    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim()
      ?? c.req.raw.headers?.get?.('x-forwarded-for')?.split(',')[0].trim()
      ?? 'unknown';

    const entry = buildEntry(opts, context, c.req.method, c.req.path, path, status, ip, c.req.header('user-agent'));
    finalize(opts, entry);
  };
}
