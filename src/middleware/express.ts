import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ObservabilityOptions, LogEntry, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { defaultLogger } from '../core/logger';
import { recordMetric } from '../core/metrics';
import { RemoteShipper } from '../core/shipper';
import { autoInstrument } from '../core/instrument';

function shouldSkip(path: string, skipRoutes: Array<string | RegExp>): boolean {
  return skipRoutes.some((pattern) =>
    typeof pattern === 'string' ? path.startsWith(pattern) : pattern.test(path)
  );
}

function getIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

/**
 * Returns an Express RequestHandler that automatically instruments every
 * request with structured JSON logs, latency tracking, trace ID propagation,
 * slow-request detection, and in-memory metrics.
 *
 * @example
 * const { observability } = require('auto-api-observe');
 * app.use(observability());
 */
export function createExpressMiddleware(options: ObservabilityOptions = {}): RequestHandler {
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

  // Auto-patch installed DB libraries (once per middleware instance)
  if (shouldAutoInstrument) {
    autoInstrument();
  }

  // Instantiate remote shipper once per middleware instance (not per request)
  const shipper = apiKey
    ? new RemoteShipper({ apiKey, endpoint, flushInterval, flushSize })
    : null;

  return function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (shouldSkip(req.path, skipRoutes)) {
      return next();
    }

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

    // Expose trace ID on the request and response
    (req as Request & { traceId: string }).traceId = traceId;
    res.setHeader(traceHeader, traceId);

    if (onRequest) {
      onRequest(context);
    }

    // Run the rest of the request inside AsyncLocalStorage so helpers
    // like trackDbCall() and addField() can find the right context.
    storage.run(context, () => {
      // Intercept res.end to capture final state after the handler runs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEnd = res.end.bind(res) as (...a: any[]) => Response;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end = function patchedEnd(...args: any[]): Response {
        const latency = Date.now() - context.startTime;
        const slow = latency > slowThreshold;

        // Best-effort route pattern (populated by Express router)
        const baseUrl = (req as Request & { baseUrl?: string }).baseUrl ?? '';
        const route: string = req.route?.path ?? ((baseUrl + (req.path || '')) || req.path);

        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          traceId,
          method: req.method,
          route,
          path: req.path,
          status: res.statusCode,
          latency,
          latencyMs: `${latency}ms`,
          dbCalls: context.dbCallsDetail,
          slow,
          ip: getIp(req),
          userAgent: req.headers['user-agent'],
          ...context.customFields,
        };

        // sampleRate < 1.0 means only log a fraction of requests.
        // Metrics are always recorded so counts stay accurate.
        if (logger !== false && (sampleRate >= 1.0 || Math.random() < sampleRate)) {
          logger(entry);
        }

        if (enableMetrics) {
          recordMetric(entry, maxRoutes);
        }

        if (onResponse) {
          onResponse(entry);
        }

        // Ship to ObserveAPI SaaS (non-blocking — batched, no await)
        if (shipper) {
          shipper.push(entry);
        }

        return originalEnd(...args);
      };

      next();
    });
  };
}
