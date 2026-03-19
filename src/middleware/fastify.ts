import { ObservabilityOptions, LogEntry, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { defaultLogger } from '../core/logger';
import { recordMetric } from '../core/metrics';
import { RemoteShipper } from '../core/shipper';
import { autoInstrument } from '../core/instrument';

// Fastify types are declared as peer deps — use loose duck-typing so the
// package compiles even when fastify is not installed.
// Compatible with Fastify v4 and v5.
type FastifyInstance = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addHook: (event: string, fn: (...args: any[]) => any) => void;
  decorateRequest: (key: string, value: unknown) => void;
};

type FastifyRequest = {
  method: string;
  url: string;
  /** Fastify v4+/v5: matched route pattern lives here. */
  routeOptions?: { url?: string };
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  ip?: string;
  // decorated by this plugin:
  traceId?: string;
  _observeCtx?: RequestContext;
};

type FastifyReply = {
  statusCode: number;
  header: (key: string, value: string) => void;
};

function shouldSkip(path: string, skipRoutes: Array<string | RegExp>): boolean {
  return skipRoutes.some((pattern) =>
    typeof pattern === 'string' ? path.startsWith(pattern) : pattern.test(path)
  );
}

function getIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

/**
 * Registers the observability plugin on a Fastify instance.
 * Compatible with Fastify v4 and v5.
 *
 * @example
 * const { fastifyObservability } = require('auto-api-observe');
 * await fastify.register(fastifyObservability, { slowThreshold: 500 });
 */
export function fastifyObservability(
  fastify: FastifyInstance,
  options: ObservabilityOptions,
  done: () => void
): void {
  const {
    slowThreshold = 1000,
    logger = defaultLogger,
    enableMetrics = true,
    skipRoutes = [],
    traceHeader = 'x-trace-id',
    maxRoutes = 1000,
    sampleRate = 1.0,
    onRequest,
    onResponse,
    autoInstrument: shouldAutoInstrument = true,
    apiKey,
    endpoint      = 'https://api.apilens.rest/v1/ingest',
    flushInterval = 5000,
    flushSize     = 100,
  } = options;

  // Auto-patch installed DB libraries (once per plugin registration)
  if (shouldAutoInstrument) {
    autoInstrument();
  }

  const shipper = apiKey
    ? new RemoteShipper({ apiKey, endpoint, flushInterval, flushSize })
    : null;

  fastify.decorateRequest('traceId', '');
  fastify.decorateRequest('_observeCtx', null);

  // Fastify v5 removed done-callback style hooks — must use async functions.
  fastify.addHook('onRequest', async (request: unknown, reply: unknown) => {
    const req = request as FastifyRequest;
    const rep = reply as FastifyReply;

    if (shouldSkip(req.url, skipRoutes)) return;

    const incomingTraceId = req.headers[traceHeader];
    const traceId = (Array.isArray(incomingTraceId) ? incomingTraceId[0] : incomingTraceId)
      ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime: Date.now(),
      dbCalls: 0,
      dbCallsDetail: createDbCalls(),
      customFields: {},
    };

    req.traceId = traceId;
    req._observeCtx = context;
    rep.header(traceHeader, traceId);

    if (onRequest) onRequest(context);

    // enterWith() binds the store to the current async execution context so
    // trackDbCall() / addField() called anywhere in this request's async chain
    // (route handler, nested helpers, etc.) will find the right context.
    // Safe here because Fastify isolates each request in its own async context.
    // Requires Node >= 16.4 — within our declared engine requirement (>=16).
    storage.enterWith(context);
  });

  fastify.addHook('onResponse', async (request: unknown, reply: unknown) => {
    const req = request as FastifyRequest;
    const rep = reply as FastifyReply;
    const context = req._observeCtx;

    if (!context) return;

    const latency = Date.now() - context.startTime;
    const slow = latency > slowThreshold;

    const route: string = req.routeOptions?.url ?? req.url;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      traceId: context.traceId,
      method: req.method,
      route,
      path: req.url,
      status: rep.statusCode,
      latency,
      latencyMs: `${latency}ms`,
      dbCalls: context.dbCallsDetail,
      slow,
      ip: getIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
      ...context.customFields,
    };

    if (logger !== false && (sampleRate >= 1.0 || Math.random() < sampleRate)) logger(entry);
    if (enableMetrics) recordMetric(entry, maxRoutes);
    if (onResponse) onResponse(entry);
    if (shipper) shipper.push(entry);
  });

  done();
}

// Equivalent to wrapping with fastify-plugin: instructs Fastify to skip scope
// encapsulation so the hooks above apply to ALL routes on the server, not just
// routes registered inside this plugin's own encapsulated context.
// This is exactly what fastify-plugin does internally — no extra dependency needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(fastifyObservability as any)[Symbol.for('skip-override')] = true;
