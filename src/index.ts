/**
 * auto-api-observe
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-config observability middleware for Express and Fastify.
 * Adds structured JSON logs, request tracing, slow-API detection,
 * distributed trace IDs, and in-memory metrics with a single `app.use()`.
 *
 * @example Express
 * ```js
 * const { observability } = require('auto-api-observe');
 * app.use(observability());
 * ```
 *
 * @example Fastify
 * ```js
 * const { fastifyObservability } = require('auto-api-observe');
 * await fastify.register(fastifyObservability, { slowThreshold: 500 });
 * ```
 */

export { createExpressMiddleware } from './middleware/express';
export { fastifyObservability } from './middleware/fastify';
export { getMetrics, resetMetrics } from './core/metrics';
export { trackDbCall, addField, getContext } from './core/storage';

export type {
  ObservabilityOptions,
  LogEntry,
  LoggerFn,
  Metrics,
  RouteMetrics,
  RequestContext,
} from './types';

// ─── Convenient default export ───────────────────────────────────────────────
// `observability()` is an alias for `createExpressMiddleware()` so users can
// follow the idiomatic Express pattern shown in the README.
import { createExpressMiddleware } from './middleware/express';
import { ObservabilityOptions } from './types';

function observability(options?: ObservabilityOptions) {
  return createExpressMiddleware(options);
}

// Attach named helpers directly on the function so CJS destructuring works
import { getMetrics, resetMetrics } from './core/metrics';
import { trackDbCall, addField, getContext } from './core/storage';
import { fastifyObservability } from './middleware/fastify';

observability.getMetrics = getMetrics;
observability.resetMetrics = resetMetrics;
observability.trackDbCall = trackDbCall;
observability.addField = addField;
observability.getContext = getContext;
observability.fastifyObservability = fastifyObservability;
observability.createExpressMiddleware = createExpressMiddleware;

export default observability;

// ─── CommonJS compat ──────────────────────────────────────────────────────────
// Allow `const observability = require('auto-api-observe')` without `.default`
if (typeof module !== 'undefined') {
  module.exports = observability;
  module.exports.default = observability;
  module.exports.observability = observability;
  module.exports.createExpressMiddleware = createExpressMiddleware;
  module.exports.fastifyObservability = fastifyObservability;
  module.exports.getMetrics = getMetrics;
  module.exports.resetMetrics = resetMetrics;
  module.exports.trackDbCall = trackDbCall;
  module.exports.addField = addField;
  module.exports.getContext = getContext;
}
