import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Compatible with Fastify v4 and v5 — duck-typed, no runtime fastify import.
type FastifyInstance = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addHook: (event: string, fn: (...args: any[]) => any) => void;
  decorateRequest: (key: string, value: unknown) => void;
};

type FastifyRequest = {
  method:          string;
  url:             string;
  routeOptions?:   { url?: string };
  headers:         Record<string, string | string[] | undefined>;
  socket?:         { remoteAddress?: string };
  ip?:             string;
  traceId?:        string;
  _observeCtx?:   RequestContext;
};

type FastifyReply = {
  statusCode: number;
  header: (k: string, v: string) => void;
};

function getIp(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

export function fastifyObservability(
  fastify: FastifyInstance,
  options: ObservabilityOptions,
  done: () => void,
): void {
  const opts = setup(options);
  if (!opts) { done(); return; }

  fastify.decorateRequest('traceId',     '');
  fastify.decorateRequest('_observeCtx', null);

  fastify.addHook('onRequest', async (request: unknown, reply: unknown) => {
    const req = request as FastifyRequest;
    const rep = reply   as FastifyReply;
    if (shouldSkip(req.url, opts.skipRoutes)) return;

    const incoming = req.headers[opts.traceHeader];
    const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    req.traceId      = traceId;
    req._observeCtx  = context;
    rep.header(opts.traceHeader, traceId);
    if (opts.onRequest) opts.onRequest(context);
    storage.enterWith(context);
  });

  fastify.addHook('onResponse', async (request: unknown, reply: unknown) => {
    const req     = request as FastifyRequest;
    const rep     = reply   as FastifyReply;
    const context = req._observeCtx;
    if (!context) return;

    const route = req.routeOptions?.url ?? req.url;
    const entry = buildEntry(opts, context, req.method, route, req.url, rep.statusCode, getIp(req), req.headers['user-agent'] as string | undefined);
    finalize(opts, entry);
  });

  done();
}

// Tells Fastify to skip scope encapsulation so hooks apply to ALL routes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(fastifyObservability as any)[Symbol.for('skip-override')] = true;
