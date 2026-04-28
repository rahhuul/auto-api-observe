import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Duck-typed Next.js API route types — works with Pages Router and App Router
// route handlers (which share the same req/res shape at runtime).
type NextRequest = {
  method?: string;
  url?:    string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};
type NextResponse = {
  statusCode:  number;
  setHeader:   (key: string, value: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  end:         (...args: any[]) => void;
};
type NextHandler = (req: NextRequest, res: NextResponse) => void | Promise<void>;

function getIp(req: NextRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Wraps a Next.js API route handler with observability.
 *
 * @example
 * // pages/api/users.ts
 * import { withObservability } from 'auto-api-observe';
 * export default withObservability(async (req, res) => { ... }, { apiKey: process.env.APILENS_KEY });
 */
export function withObservability(handler: NextHandler, options: ObservabilityOptions = {}): NextHandler {
  const opts = setup(options);
  if (!opts) return handler;

  return async function observedNextHandler(req: NextRequest, res: NextResponse): Promise<void> {
    const path = (() => { try { return new URL(req.url ?? '/', 'http://localhost').pathname; } catch { return req.url ?? '/'; } })();
    if (shouldSkip(path, opts.skipRoutes)) { await handler(req, res); return; }

    const incoming = req.headers[opts.traceHeader];
    const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    res.setHeader(opts.traceHeader, traceId);
    if (opts.onRequest) opts.onRequest(context);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalEnd = res.end.bind(res) as (...a: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).end = function patchedEnd(...args: any[]) {
      const ua    = req.headers['user-agent'];
      const entry = buildEntry(opts, context, req.method ?? 'GET', path, path, res.statusCode, getIp(req), Array.isArray(ua) ? ua[0] : ua);
      finalize(opts, entry);
      return originalEnd(...args);
    };

    await storage.run(context, () => handler(req, res));
  };
}
