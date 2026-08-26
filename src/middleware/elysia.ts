import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize, ResolvedOptions } from '../core/factory';

// Per-request context keyed by the Web API Request object (Bun-native)
const _ctxMap = new WeakMap<Request, RequestContext>();

function logAndClear(opts: ResolvedOptions, context: RequestContext, request: Request, path: string, status: number): void {
  const ip    = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua    = request.headers.get('user-agent') ?? undefined;
  const entry = buildEntry(opts, context, request.method, path, path, status, ip, ua);
  finalize(opts, entry);
  _ctxMap.delete(request);
}

/**
 * Elysia plugin for auto-api-observe (Bun-native).
 *
 * @example
 * import { Elysia } from 'elysia';
 * import { elysiaObservability } from 'auto-api-observe';
 *
 * new Elysia()
 *   .use(elysiaObservability({ apiKey: process.env.APILENS_KEY }))
 *   .get('/', () => 'Hello')
 *   .listen(3000);
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function elysiaObservability(options: ObservabilityOptions = {}): (app: any) => any {
  const opts = setup(options);

  // Elysia's `.use()` calls a plain function plugin as `plugin(app)` and
  // uses its return value — this is the current (v1.x) plugin contract.
  // (An older `{ name, version, setup(app) }` object shape is NOT handled
  // by `.use()` in current Elysia and throws instead.) A plain function
  // avoids importing elysia at the top level too (it's a Bun peer dep and
  // must not be bundled).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function auto_api_observe(app: any) {
    if (!opts) return app;

    return app
      .onRequest(({ request, set, path }: { request: Request; set: { headers: Record<string, string> }; path: string }) => {
        if (shouldSkip(path, opts.skipRoutes)) return;

        const traceId = request.headers.get(opts.traceHeader) ?? generateTraceId();
        const context: RequestContext = {
          traceId,
          startTime:     Date.now(),
          dbCalls:       0,
          dbCallsDetail: createDbCalls(),
          customFields:  {},
        };

        set.headers[opts.traceHeader] = traceId;
        _ctxMap.set(request, context);
        if (opts.onRequest) opts.onRequest(context);
        storage.enterWith(context);
      })
      .onAfterHandle(({ request, set, path }: { request: Request; set: { status?: number | string; headers: Record<string, string> }; path: string }) => {
        const context = _ctxMap.get(request);
        if (!context) return;

        const status = typeof set.status === 'number' ? set.status : 200;
        logAndClear(opts, context, request, path, status);
      })
      // onAfterHandle only fires when the handler completes successfully —
      // a thrown error (validation, not-found, or an uncaught handler
      // error) skips it entirely, so those requests would never get
      // logged at all without this. onError fires for exactly that case;
      // returning nothing here leaves Elysia's own default error response
      // completely untouched.
      .onError(({ request, set, path, code }: { request: Request; set: { status?: number | string; headers: Record<string, string> }; path: string; code: string }) => {
        const context = _ctxMap.get(request);
        if (!context) return;

        const status = typeof set.status === 'number'
          ? set.status
          : (code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 422 : 500);
        logAndClear(opts, context, request, path, status);
      });
  };
}
