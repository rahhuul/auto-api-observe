import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, buildEntry, finalize } from '../core/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LambdaEvent   = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LambdaContext  = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LambdaResult   = Record<string, any>;
type LambdaHandler  = (event: LambdaEvent, context: LambdaContext) => Promise<LambdaResult>;

/**
 * Wraps an AWS Lambda handler (API Gateway / Function URL) with observability.
 * Compatible with API Gateway v1 (REST), v2 (HTTP), and Lambda Function URLs.
 *
 * @example
 * import { withLambdaObservability } from 'auto-api-observe';
 *
 * const handler = async (event, context) => ({ statusCode: 200, body: 'OK' });
 * export const lambdaHandler = withLambdaObservability(handler, { apiKey: process.env.APILENS_KEY });
 */
export function withLambdaObservability(
  handler: LambdaHandler,
  options: ObservabilityOptions = {},
): LambdaHandler {
  const opts = setup(options);
  if (!opts) return handler;

  return async function observedLambdaHandler(event: LambdaEvent, lambdaCtx: LambdaContext): Promise<LambdaResult> {
    // Support API GW v1, v2, and Lambda Function URLs
    const method  = event.httpMethod ?? event.requestContext?.http?.method ?? 'INVOKE';
    const path    = event.path ?? event.rawPath ?? '/lambda';
    const headers = (event.headers ?? {}) as Record<string, string>;
    const traceId = headers[opts.traceHeader] ?? generateTraceId();

    const context: RequestContext = {
      traceId,
      startTime:     Date.now(),
      dbCalls:       0,
      dbCallsDetail: createDbCalls(),
      customFields:  {},
    };

    if (opts.onRequest) opts.onRequest(context);

    const ip = headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
    const ua = headers['user-agent'];

    let result: LambdaResult;
    try {
      result = await storage.run(context, () => handler(event, lambdaCtx));
    } catch (err) {
      const entry = buildEntry(opts, context, method, path, path, 500, ip, ua);
      finalize(opts, entry);
      throw err;
    }

    const entry = buildEntry(opts, context, method, path, path, result?.statusCode ?? 200, ip, ua);
    finalize(opts, entry);
    return result;
  };
}
