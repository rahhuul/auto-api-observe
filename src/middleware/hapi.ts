import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, buildEntry, finalize } from '../core/factory';

// Duck-typed Hapi server interface — no @hapi/hapi peer dep at build time.
type HapiServer = {
  ext: (event: string, method: (request: Record<string, any>, h: Record<string, any>) => any) => void;
};

// Per-request context keyed by the Hapi request object
const _ctxMap = new WeakMap<object, RequestContext>();

/**
 * Hapi plugin for auto-api-observe.
 *
 * @example
 * await server.register({ plugin: hapiObservabilityPlugin, options: { apiKey: process.env.APILENS_KEY } });
 */
export const hapiObservabilityPlugin = {
  name:    'auto-api-observe',
  version: '1.3.0',
  register(server: HapiServer, options: ObservabilityOptions = {}): void {
    const opts = setup(options);
    if (!opts) return;

    server.ext('onPreAuth', (request: Record<string, any>, h: Record<string, any>) => {
      const headers  = request.headers ?? {};
      const incoming = headers[opts.traceHeader];
      const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

      const context: RequestContext = {
        traceId,
        startTime:     Date.now(),
        dbCalls:       0,
        dbCallsDetail: createDbCalls(),
        customFields:  {},
      };

      _ctxMap.set(request, context);
      if (opts.onRequest) opts.onRequest(context);
      storage.enterWith(context);

      return h.continue;
    });

    server.ext('onPreResponse', (request: Record<string, any>, h: Record<string, any>) => {
      const context = _ctxMap.get(request);
      if (!context) return h.continue;

      const resp   = request.response;
      const status = resp?.isBoom ? (resp.output?.statusCode ?? 500) : (resp?.statusCode ?? 200);
      const ip     = request.info?.remoteAddress ?? 'unknown';
      const ua     = request.headers?.['user-agent'];
      const route  = request.route?.path ?? request.path ?? '/';

      const entry = buildEntry(opts, context, (request.method ?? 'GET').toUpperCase(), route, request.path ?? '/', status, ip, ua);
      finalize(opts, entry);
      _ctxMap.delete(request);

      return h.continue;
    });
  },
};
