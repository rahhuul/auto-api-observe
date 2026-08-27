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
 * Wraps a Next.js **Pages Router** API route handler with observability.
 *
 * For **App Router** route handlers (`app/api/.../route.ts`), use
 * {@link withAppRouterObservability} instead — App Router handlers receive a
 * Fetch API `Request` and return a `Response`, not the Node.js `(req, res)`
 * pair this function expects.
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

// ─── App Router ─────────────────────────────────────────────────────────────

// App Router route handlers use the Fetch API — a `Request` in, a `Response`
// out, no mutable response object. `context.params` is typed loosely (plain
// object or Promise) since Next.js 15 made dynamic-route params async while
// 13/14 kept them synchronous; this wrapper never inspects it, only forwards
// it, so it's compatible with either.
type AppRouteContext = { params?: unknown };
type AppRouteHandler = (request: Request, context: AppRouteContext) => Response | Promise<Response>;

function getAppRouterIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}

/**
 * Wraps a Next.js **App Router** route handler (`app/api/.../route.ts`) with
 * observability. For the legacy **Pages Router** (`pages/api/*.ts`), use
 * {@link withObservability} instead.
 *
 * @example
 * // app/api/users/route.ts
 * import { withAppRouterObservability } from 'auto-api-observe';
 * export const GET = withAppRouterObservability(async (request) => {
 *   return Response.json({ users: [] });
 * }, { apiKey: process.env.APILENS_KEY });
 */
export function withAppRouterObservability(handler: AppRouteHandler, options: ObservabilityOptions = {}): AppRouteHandler {
  const opts = setup(options);
  if (!opts) return handler;

  return async function observedAppRouteHandler(request: Request, context: AppRouteContext = {}): Promise<Response> {
    const path = (() => { try { return new URL(request.url).pathname; } catch { return request.url; } })();
    if (shouldSkip(path, opts.skipRoutes)) return handler(request, context);

    const traceId = request.headers.get(opts.traceHeader) ?? generateTraceId();
    const ip = getAppRouterIp(request);
    const userAgent = request.headers.get('user-agent') ?? undefined;

    const reqContext: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    if (opts.onRequest) opts.onRequest(reqContext);

    let response: Response;
    try {
      response = await storage.run(reqContext, () => handler(request, context));
    } catch (err) {
      const entry = buildEntry(opts, reqContext, request.method ?? 'GET', path, path, 500, ip, userAgent);
      finalize(opts, entry);
      throw err;
    }

    const entry = buildEntry(opts, reqContext, request.method ?? 'GET', path, path, response.status, ip, userAgent);
    finalize(opts, entry);

    // Response is immutable once constructed — clone it to add the trace
    // header rather than mutating (there's nothing to mutate). Wrapping
    // response.body (a stream, or null) doesn't consume it.
    const headers = new Headers(response.headers);
    headers.set(opts.traceHeader, traceId);
    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
