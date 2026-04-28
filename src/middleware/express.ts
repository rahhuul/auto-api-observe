/**
 * @module
 * Express middleware for auto-api-observe. Use `createExpressMiddleware` or
 * the default `observe()` alias for zero-config request tracing.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress ?? req.ip ?? 'unknown';
}

/**
 * Creates an Express `RequestHandler` that auto-instruments all routes with
 * request tracing, DB profiling, outbound HTTP tracking, and real-time metrics.
 *
 * @example
 * ```js
 * import express from 'express';
 * import { createExpressMiddleware } from 'auto-api-observe';
 *
 * const app = express();
 * app.use(createExpressMiddleware({ apiKey: process.env.APILENS_KEY }));
 * ```
 */
export function createExpressMiddleware(options: ObservabilityOptions = {}): RequestHandler {
  const opts = setup(options);

  // No apiKey — transparent no-op so the app still boots
  if (!opts) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (shouldSkip(req.path, opts.skipRoutes)) return next();

    const incoming = req.headers[opts.traceHeader];
    const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:      Date.now(),
      dbCalls:        0,
      dbCallsDetail:  createDbCalls(),
      customFields:   {},
    };

    (req as Request & { traceId: string }).traceId = traceId;
    res.setHeader(opts.traceHeader, traceId);
    if (opts.onRequest) opts.onRequest(context);

    storage.run(context, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEnd = res.end.bind(res) as (...a: any[]) => Response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end = function patchedEnd(...args: any[]): Response {
        const baseUrl      = (req as Request & { baseUrl?: string }).baseUrl ?? '';
        const route        = req.route?.path ?? ((baseUrl + req.path) || req.path);
        const requestSize  = parseInt(req.headers['content-length'] ?? '0', 10) || undefined;
        const responseSize = parseInt((res.getHeader('content-length') as string) ?? '0', 10) || undefined;
        const entry        = buildEntry(opts, context, req.method, route, req.path, res.statusCode, getIp(req), req.headers['user-agent'], { requestSize, responseSize });
        finalize(opts, entry);
        return originalEnd(...args);
      };
      next();
    });
  };
}
