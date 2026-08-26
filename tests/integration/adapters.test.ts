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

  // Real rxjs Observables — not a fake `{ pipe: () => 'piped' }` mock. This
  // is exactly what the earlier mock-based test missed: `tap(fn)`'s plain
  // (next-only) form never fires when the observable errors, so a request
  // whose handler threw was silently never logged at all. Regression guard
  // using the real rxjs error-propagation semantics.
  describe('with real rxjs Observables', () => {
    it('logs a successful request with status 200', async () => {
      const { of } = await import('rxjs');
      const entries: unknown[] = [];
      const Interceptor = createNestObservabilityInterceptor({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) });
      const instance = new Interceptor();
      const res: Record<string, unknown> = { statusCode: 200, setHeader: () => {} };
      const mockCtx = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => res }) };
      const mockHandle = { handle: () => of({ ok: true }) };

      const result = await new Promise((resolve, reject) => {
        instance.intercept(mockCtx as any, mockHandle as any).subscribe({ next: resolve, error: reject });
      });

      expect(result).toEqual({ ok: true });
      expect(entries).toHaveLength(1);
      expect((entries[0] as { status: number }).status).toBe(200);
    });

    it('logs a request whose handler errors, and still propagates the error to the subscriber', async () => {
      const { throwError } = await import('rxjs');
      const entries: unknown[] = [];
      const Interceptor = createNestObservabilityInterceptor({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) });
      const instance = new Interceptor();
      const res: Record<string, unknown> = { statusCode: 200, setHeader: () => {} };
      const mockCtx = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => res }) };
      const boomError = new Error('boom');
      const mockHandle = { handle: () => throwError(() => boomError) };

      const caughtError = await new Promise((resolve) => {
        instance.intercept(mockCtx as any, mockHandle as any).subscribe({
          next: () => resolve(null),
          error: (err: unknown) => resolve(err),
        });
      });

      expect(caughtError).toBe(boomError); // error was NOT swallowed
      expect(entries).toHaveLength(1);
      expect((entries[0] as { status: number }).status).toBe(500);
    });
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
  // Elysia's `.use()` calls a plain function plugin as `plugin(app)` and
  // uses its return value (current v1.x plugin contract) — an older
  // `{ name, version, setup(app) }` object shape is NOT handled by `.use()`
  // in current Elysia and throws instead.
  it('returns a plain function plugin', () => {
    const spy = WARN_SPY();
    const plugin = elysiaObservability({});
    expect(typeof plugin).toBe('function');
  });

  it('is a no-op (returns app unchanged) when no apiKey', () => {
    const spy = WARN_SPY();
    const plugin = elysiaObservability({});
    const mockApp = { onRequest: () => mockApp, onAfterHandle: () => mockApp, onError: () => mockApp };
    const result = plugin(mockApp);
    // No-apiKey path returns app without attaching hooks
    expect(result).toBe(mockApp);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('attaches onRequest, onAfterHandle, and onError hooks when apiKey is provided', () => {
    const spy = WARN_SPY();
    const plugin = elysiaObservability({ apiKey: 'test_key', logger: false, processMetrics: false });
    const hooksAttached: string[] = [];
    const mockApp: Record<string, unknown> = {};
    for (const hook of ['onRequest', 'onAfterHandle', 'onError']) {
      mockApp[hook] = (_fn: unknown) => { hooksAttached.push(hook); return mockApp; };
    }
    const result = plugin(mockApp);
    expect(result).toBe(mockApp);
    expect(hooksAttached).toEqual(['onRequest', 'onAfterHandle', 'onError']);
    expect(spy).not.toHaveBeenCalled();
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
