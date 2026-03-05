import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ObservabilityOptions, LogEntry, RequestContext } from '../types';
import { storage } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { defaultLogger } from '../core/logger';
import { recordMetric } from '../core/metrics';

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
    onRequest,
    onResponse,
  } = options;

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
          dbCalls: context.dbCalls,
          slow,
          ip: getIp(req),
          userAgent: req.headers['user-agent'],
          ...context.customFields,
        };

        if (logger !== false) {
          logger(entry);
        }

        if (enableMetrics) {
          recordMetric(entry);
        }

        if (onResponse) {
          onResponse(entry);
        }

        return originalEnd(...args);
      };

      next();
    });
  };
}
