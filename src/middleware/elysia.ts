import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Per-request context keyed by the Web API Request object (Bun-native)
const _ctxMap = new WeakMap<Request, RequestContext>();

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
export function elysiaObservability(options: ObservabilityOptions = {}) {
  const opts = setup(options);

  // Return an object conforming to Elysia's plugin contract.
  // Using a plain object + `setup` avoids importing elysia at the top level
  // (it is a Bun peer dep and must not be bundled).
  return {
    name:    'auto-api-observe',
    version: '1.3.0',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(app: any) {
      if (!opts) return app;

      app
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

          const status  = typeof set.status === 'number' ? set.status : 200;
          const ip      = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
          const ua      = request.headers.get('user-agent') ?? undefined;
          const entry   = buildEntry(opts, context, request.method, path, path, status, ip, ua);
          finalize(opts, entry);
          _ctxMap.delete(request);
        });

      return app;
    },
  };
}
