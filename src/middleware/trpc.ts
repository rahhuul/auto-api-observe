import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, buildEntry, finalize } from '../core/factory';

// Duck-typed tRPC middleware signature (compatible with tRPC v10 and v11)
type TrpcProcedureType = 'query' | 'mutation' | 'subscription';
type TrpcMiddlewareOpts = {
  path:  string;
  type:  TrpcProcedureType;
  ctx:   unknown;
  next:  (opts?: { ctx?: unknown }) => Promise<{ ok: boolean; [k: string]: unknown }>;
  input: unknown;
};

/**
 * tRPC middleware for auto-api-observe.
 * Pass this to `t.middleware()` (tRPC v10+).
 *
 * @example
 * import { createTrpcObservabilityMiddleware } from 'auto-api-observe';
 *
 * const isObserved = t.middleware(
 *   createTrpcObservabilityMiddleware({ apiKey: process.env.APILENS_KEY })
 * );
 *
 * // Apply to all procedures:
 * const publicProcedure = t.procedure.use(isObserved);
 */
export function createTrpcObservabilityMiddleware(options: ObservabilityOptions = {}): (opts: TrpcMiddlewareOpts) => Promise<{ ok: boolean; [k: string]: unknown }> {
  const opts = setup(options);

  return async function trpcObservabilityMiddleware({ path, type, ctx, next }: TrpcMiddlewareOpts) {
    if (!opts) return next({ ctx });

    const traceId = generateTraceId();
    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    if (opts.onRequest) opts.onRequest(context);
    storage.enterWith(context);

    const result = await next({ ctx });

    // tRPC paths use dot notation (e.g. "user.getById") — convert to URL-like route
    const urlPath = `/${path.replace(/\./g, '/')}`;
    const entry   = buildEntry(opts, context, type.toUpperCase(), path, urlPath, result.ok ? 200 : 500, 'unknown', undefined);
    finalize(opts, entry);

    return result;
  };
}
