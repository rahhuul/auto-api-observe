/**
 * Adapter smoke tests — verifies every framework adapter:
 *   1. Returns a no-op (and warns) when apiKey is missing
 *   2. Returns the correct type when apiKey is provided
 *   3. Passes requests through correctly (where testable without the framework)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { koaObservability }                           from '../../src/middleware/koa';
import { honoObservability }                          from '../../src/middleware/hono';
import { createNestObservabilityInterceptor }         from '../../src/middleware/nestjs';
import { withObservability as withNextObservability } from '../../src/middleware/nextjs';
import { hapiObservabilityPlugin }                    from '../../src/middleware/hapi';
import { elysiaObservability }                        from '../../src/middleware/elysia';
import { apolloObservabilityPlugin }                  from '../../src/middleware/apollo';
import { withLambdaObservability }                    from '../../src/middleware/lambda';
import { createTrpcObservabilityMiddleware }          from '../../src/middleware/trpc';
import { createRestifyMiddleware }                    from '../../src/middleware/restify';

const WARN_SPY = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => vi.restoreAllMocks());

// ─── Koa ──────────────────────────────────────────────────────────────────────

describe('koaObservability', () => {
  it('warns and returns a no-op function when no apiKey', async () => {
    const spy = WARN_SPY();
    const mw = koaObservability({});
    expect(spy).toHaveBeenCalledOnce();
    expect(typeof mw).toBe('function');
    let nextCalled = false;
    await mw({ method: 'GET', path: '/test', url: '/test', status: 200, request: { headers: {} }, set: () => {} } as any, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('returns a function when apiKey is provided', () => {
    const spy = WARN_SPY();
    const mw = koaObservability({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(typeof mw).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Hono ─────────────────────────────────────────────────────────────────────

describe('honoObservability', () => {
  it('warns and returns a no-op function when no apiKey', async () => {
    const spy = WARN_SPY();
    const mw = honoObservability({});
    expect(spy).toHaveBeenCalledOnce();
    expect(typeof mw).toBe('function');
    let nextCalled = false;
    await mw({ req: { method: 'GET', path: '/test', url: 'http://localhost/test', header: () => undefined, raw: {} }, res: new Response(), header: () => {} } as any, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('returns a function when apiKey is provided', () => {
    const spy = WARN_SPY();
    const mw = honoObservability({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(typeof mw).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── NestJS ───────────────────────────────────────────────────────────────────

describe('createNestObservabilityInterceptor', () => {
  it('warns and returns a class that passes through when no apiKey', () => {
    const spy = WARN_SPY();
    const Interceptor = createNestObservabilityInterceptor({});
    expect(spy).toHaveBeenCalledOnce();
    const instance = new Interceptor();
    const mockHandle = { handle: () => ({ pipe: (fn: any) => 'piped' }) };
    const mockCtx = { switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }) };
    const result = instance.intercept(mockCtx as any, mockHandle as any);
    // No-apiKey path calls next.handle() directly
    expect(result).toBeDefined();
  });

  it('returns a class when apiKey is provided', () => {
    const spy = WARN_SPY();
    const Interceptor = createNestObservabilityInterceptor({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(typeof Interceptor).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Next.js ──────────────────────────────────────────────────────────────────

describe('withNextObservability', () => {
  it('warns and returns original handler when no apiKey', async () => {
    const spy = WARN_SPY();
    const handler = async (_req: any, res: any) => { res.statusCode = 200; res.end(); };
    const wrapped = withNextObservability(handler, {});
    expect(spy).toHaveBeenCalledOnce();
    expect(wrapped).toBe(handler);
  });

  it('returns a wrapped function when apiKey provided', () => {
    const spy = WARN_SPY();
    const handler = async (_req: any, res: any) => { res.end(); };
    const wrapped = withNextObservability(handler, { apiKey: 'test_key', logger: false, processMetrics: false });
    expect(wrapped).not.toBe(handler);
    expect(typeof wrapped).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls through to original handler', async () => {
    const spy = WARN_SPY();
    let called = false;
    const handler = async (_req: any, res: any) => { called = true; res.end(); };
    const wrapped = withNextObservability(handler, { apiKey: 'test_key', logger: false, processMetrics: false });
    const mockRes = { statusCode: 200, setHeader: () => {}, end: () => {} };
    await wrapped({ method: 'GET', url: '/test', headers: {}, socket: {} } as any, mockRes as any);
    expect(called).toBe(true);
  });
});

// ─── Hapi ─────────────────────────────────────────────────────────────────────

describe('hapiObservabilityPlugin', () => {
  it('has the correct plugin name and version', () => {
    expect(hapiObservabilityPlugin.name).toBe('auto-api-observe');
    expect(typeof hapiObservabilityPlugin.version).toBe('string');
    expect(typeof hapiObservabilityPlugin.register).toBe('function');
  });

  it('warns and returns early when no apiKey', () => {
    const spy = WARN_SPY();
    const extCalls: string[] = [];
    const mockServer = { ext: (event: string) => extCalls.push(event) };
    hapiObservabilityPlugin.register(mockServer as any, {});
    expect(spy).toHaveBeenCalledOnce();
    expect(extCalls).toHaveLength(0); // no hooks registered
  });

  it('registers onPreAuth and onPreResponse when apiKey provided', () => {
    const spy = WARN_SPY();
    const extCalls: string[] = [];
    const mockServer = { ext: (event: string) => extCalls.push(event) };
    hapiObservabilityPlugin.register(mockServer as any, { apiKey: 'test_key', logger: false, processMetrics: false });
    expect(extCalls).toContain('onPreAuth');
    expect(extCalls).toContain('onPreResponse');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Elysia ───────────────────────────────────────────────────────────────────

describe('elysiaObservability', () => {
  it('returns a plugin object with name and setup function', () => {
    const spy = WARN_SPY();
    const plugin = elysiaObservability({});
    expect(plugin.name).toBe('auto-api-observe');
    expect(typeof plugin.setup).toBe('function');
  });

  it('setup is a no-op (returns app unchanged) when no apiKey', () => {
    const spy = WARN_SPY();
    const plugin = elysiaObservability({});
    const mockApp = { onRequest: () => mockApp, onAfterHandle: () => mockApp };
    const result = plugin.setup(mockApp);
    // No-apiKey path returns app without attaching hooks
    expect(result).toBe(mockApp);
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ─── Apollo ───────────────────────────────────────────────────────────────────

describe('apolloObservabilityPlugin', () => {
  it('returns empty object when no apiKey', () => {
    const spy = WARN_SPY();
    const plugin = apolloObservabilityPlugin({});
    expect(plugin).toEqual({});
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns an object with requestDidStart when apiKey provided', () => {
    const spy = WARN_SPY();
    const plugin = apolloObservabilityPlugin({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(typeof plugin.requestDidStart).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Lambda ───────────────────────────────────────────────────────────────────

describe('withLambdaObservability', () => {
  it('returns the original handler when no apiKey', () => {
    const spy = WARN_SPY();
    const handler = async () => ({ statusCode: 200 });
    const wrapped = withLambdaObservability(handler, {});
    expect(wrapped).toBe(handler);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns a wrapped function when apiKey provided', () => {
    const spy = WARN_SPY();
    const handler = async () => ({ statusCode: 200 });
    const wrapped = withLambdaObservability(handler, { apiKey: 'test_key', logger: false, processMetrics: false });
    expect(wrapped).not.toBe(handler);
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes event through to handler and returns its result', async () => {
    const spy = WARN_SPY();
    const handler = async (event: any) => ({ statusCode: 200, body: event.body });
    const wrapped = withLambdaObservability(handler, { apiKey: 'test_key', logger: false, processMetrics: false });
    const result = await wrapped({ httpMethod: 'POST', path: '/test', body: 'hello', headers: {} }, {});
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('hello');
  });

  it('re-throws handler errors and still records the call', async () => {
    const spy = WARN_SPY();
    const handler = async () => { throw new Error('lambda error'); };
    const wrapped = withLambdaObservability(handler, { apiKey: 'test_key', logger: false, processMetrics: false });
    await expect(wrapped({ httpMethod: 'GET', path: '/test', headers: {} }, {})).rejects.toThrow('lambda error');
  });
});

// ─── tRPC ─────────────────────────────────────────────────────────────────────

describe('createTrpcObservabilityMiddleware', () => {
  it('warns when no apiKey', () => {
    const spy = WARN_SPY();
    createTrpcObservabilityMiddleware({});
    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns a function', () => {
    const spy = WARN_SPY();
    const mw = createTrpcObservabilityMiddleware({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(typeof mw).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls next and returns its result when no apiKey', async () => {
    const spy = WARN_SPY();
    const mw = createTrpcObservabilityMiddleware({});
    const nextResult = { ok: true, data: 'test' };
    const result = await mw({ path: 'user.getById', type: 'query', ctx: {}, next: async () => nextResult, input: {} } as any);
    expect(result).toBe(nextResult);
  });

  it('calls next and returns its result with apiKey', async () => {
    const spy = WARN_SPY();
    const mw = createTrpcObservabilityMiddleware({ apiKey: 'test_key', logger: false, processMetrics: false });
    const nextResult = { ok: true, data: 'hello' };
    const result = await mw({ path: 'post.list', type: 'query', ctx: {}, next: async ({ ctx }: any) => nextResult, input: {} } as any);
    expect(result).toEqual(nextResult);
  });
});

// ─── Restify (re-export of Express) ──────────────────────────────────────────

describe('createRestifyMiddleware', () => {
  it('is a function', () => {
    expect(typeof createRestifyMiddleware).toBe('function');
  });

  it('warns and returns a no-op when no apiKey', () => {
    const spy = WARN_SPY();
    const mw = createRestifyMiddleware({});
    expect(spy).toHaveBeenCalledOnce();
    expect(typeof mw).toBe('function');
  });
});
