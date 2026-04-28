import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, shouldSkip, buildEntry, finalize } from '../core/factory';

// Duck-typed NestJS interfaces — no @nestjs/common peer dep required at build time.
type ExecutionContext = {
  switchToHttp: () => {
    getRequest:  () => Record<string, any>;
    getResponse: () => Record<string, any>;
  };
};
type CallHandler = { handle: () => any };

/**
 * Returns a NestJS-compatible interceptor class.
 *
 * @example
 * // main.ts
 * import { createNestObservabilityInterceptor } from 'auto-api-observe';
 * const Interceptor = createNestObservabilityInterceptor({ apiKey: process.env.APILENS_KEY });
 * app.useGlobalInterceptors(new Interceptor());
 */
export function createNestObservabilityInterceptor(options: ObservabilityOptions = {}) {
  const opts = setup(options);

  return class ObservabilityInterceptor {
    intercept(executionCtx: ExecutionContext, next: CallHandler): any {
      if (!opts) return next.handle();

      const req  = executionCtx.switchToHttp().getRequest();
      const res  = executionCtx.switchToHttp().getResponse();
      const path = req.path ?? req.url ?? '/';

      if (shouldSkip(path, opts.skipRoutes)) return next.handle();

      const incoming = req.headers?.[opts.traceHeader];
      const traceId  = (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateTraceId();

      const context: RequestContext = {
        traceId,
        startTime:     Date.now(),
        dbCalls:       0,
        dbCallsDetail: createDbCalls(),
        customFields:  {},
      };

      req.traceId = traceId;
      res.setHeader?.(opts.traceHeader, traceId);
      if (opts.onRequest) opts.onRequest(context);
      storage.enterWith(context);

      // rxjs tap is available in any NestJS project — dynamic require avoids
      // listing rxjs as a hard peer dep of this package.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { tap } = require('rxjs/operators') as { tap: (fn: () => void) => any };
      return next.handle().pipe(
        tap(() => {
          const ip    = req.headers?.['x-forwarded-for']?.split(',')[0].trim() ?? req.ip ?? 'unknown';
          const route = req.route?.path ?? path;
          const entry = buildEntry(opts, context, req.method ?? 'GET', route, path, res.statusCode ?? 200, ip, req.headers?.['user-agent']);
          finalize(opts, entry);
        }),
      );
    }
  };
}
