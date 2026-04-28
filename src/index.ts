/**
 * auto-api-observe
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-config observability for Node.js APIs — request tracing, DB profiling,
 * slow-request detection, distributed trace IDs, and structured JSON logs.
 * Ships telemetry to apilens.rest when an apiKey is provided.
 *
 * Supported frameworks: Express · Fastify · Koa · Hono · NestJS · Next.js ·
 *   Hapi · Elysia · Apollo Server · AWS Lambda · tRPC · Restify
 *
 * @example Express
 * ```js
 * const { observe } = require('auto-api-observe');
 * app.use(observe({ apiKey: process.env.APILENS_KEY }));
 * ```
 *
 * @example Fastify
 * ```js
 * const { fastifyObservability } = require('auto-api-observe');
 * await fastify.register(fastifyObservability, { apiKey: process.env.APILENS_KEY });
 * ```
 */

// ─── Framework adapters ───────────────────────────────────────────────────────
export { createExpressMiddleware }                         from './middleware/express';
export { fastifyObservability }                            from './middleware/fastify';
export { koaObservability }                                from './middleware/koa';
export { honoObservability }                               from './middleware/hono';
export { createNestObservabilityInterceptor }              from './middleware/nestjs';
export { withObservability as withNextObservability }      from './middleware/nextjs';
export { hapiObservabilityPlugin }                         from './middleware/hapi';
export { elysiaObservability }                             from './middleware/elysia';
export { apolloObservabilityPlugin }                       from './middleware/apollo';
export { withLambdaObservability }                         from './middleware/lambda';
export { createTrpcObservabilityMiddleware }               from './middleware/trpc';
export { createRestifyMiddleware }                         from './middleware/restify';

// ─── Core utilities ───────────────────────────────────────────────────────────
export { getMetrics, resetMetrics }                        from './core/metrics';
export { trackDbCall, recordDbQuery, addField, getContext } from './core/storage';
export { autoInstrument }                                  from './core/instrument';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  ObservabilityOptions,
  LogEntry,
  LoggerFn,
  Metrics,
  RouteMetrics,
  RequestContext,
  DbCalls,
  DbQuery,
} from './types';

// ─── Default export — `observe()` alias for Express ──────────────────────────
import { createExpressMiddleware }            from './middleware/express';
import { ObservabilityOptions }               from './types';
import { getMetrics, resetMetrics }           from './core/metrics';
import { trackDbCall, recordDbQuery, addField, getContext } from './core/storage';
import { autoInstrument }                     from './core/instrument';
import { fastifyObservability }               from './middleware/fastify';
import { koaObservability }                   from './middleware/koa';
import { honoObservability }                  from './middleware/hono';
import { createNestObservabilityInterceptor } from './middleware/nestjs';
import { withObservability as withNextObservability } from './middleware/nextjs';
import { hapiObservabilityPlugin }            from './middleware/hapi';
import { elysiaObservability }                from './middleware/elysia';
import { apolloObservabilityPlugin }          from './middleware/apollo';
import { withLambdaObservability }            from './middleware/lambda';
import { createTrpcObservabilityMiddleware }  from './middleware/trpc';
import { createRestifyMiddleware }            from './middleware/restify';

function observe(options?: ObservabilityOptions) {
  return createExpressMiddleware(options);
}

observe.createExpressMiddleware            = createExpressMiddleware;
observe.fastifyObservability               = fastifyObservability;
observe.koaObservability                   = koaObservability;
observe.honoObservability                  = honoObservability;
observe.createNestObservabilityInterceptor = createNestObservabilityInterceptor;
observe.withNextObservability              = withNextObservability;
observe.hapiObservabilityPlugin            = hapiObservabilityPlugin;
observe.elysiaObservability                = elysiaObservability;
observe.apolloObservabilityPlugin          = apolloObservabilityPlugin;
observe.withLambdaObservability            = withLambdaObservability;
observe.createTrpcObservabilityMiddleware  = createTrpcObservabilityMiddleware;
observe.createRestifyMiddleware            = createRestifyMiddleware;
observe.getMetrics                         = getMetrics;
observe.resetMetrics                       = resetMetrics;
observe.trackDbCall                        = trackDbCall;
observe.recordDbQuery                      = recordDbQuery;
observe.addField                           = addField;
observe.getContext                         = getContext;
observe.autoInstrument                     = autoInstrument;

export default observe;

// ─── CommonJS compat ──────────────────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports                                    = observe;
  module.exports.default                            = observe;
  module.exports.observe                            = observe;
  module.exports.createExpressMiddleware            = createExpressMiddleware;
  module.exports.fastifyObservability               = fastifyObservability;
  module.exports.koaObservability                   = koaObservability;
  module.exports.honoObservability                  = honoObservability;
  module.exports.createNestObservabilityInterceptor = createNestObservabilityInterceptor;
  module.exports.withNextObservability              = withNextObservability;
  module.exports.hapiObservabilityPlugin            = hapiObservabilityPlugin;
  module.exports.elysiaObservability                = elysiaObservability;
  module.exports.apolloObservabilityPlugin          = apolloObservabilityPlugin;
  module.exports.withLambdaObservability            = withLambdaObservability;
  module.exports.createTrpcObservabilityMiddleware  = createTrpcObservabilityMiddleware;
  module.exports.createRestifyMiddleware            = createRestifyMiddleware;
  module.exports.autoInstrument                     = autoInstrument;
  module.exports.getMetrics                         = getMetrics;
  module.exports.resetMetrics                       = resetMetrics;
  module.exports.trackDbCall                        = trackDbCall;
  module.exports.recordDbQuery                      = recordDbQuery;
  module.exports.addField                           = addField;
  module.exports.getContext                         = getContext;
}
