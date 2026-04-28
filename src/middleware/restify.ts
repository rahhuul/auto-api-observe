// Restify uses the exact same req/res/next middleware signature as Express.
// Re-export createExpressMiddleware under a Restify-friendly name.
export { createExpressMiddleware as createRestifyMiddleware } from './express';
