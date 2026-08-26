/**
 * Integration tests for fastifyObservability.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { fastifyObservability } from '../../src/middleware/fastify';
import { resetMetrics, getMetrics } from '../../src/core/metrics';

type FastifyApp = ReturnType<typeof Fastify>;

async function buildApp(opts: Parameters<typeof fastifyObservability>[1] = {}): Promise<FastifyApp> {
  const app = Fastify({ logger: false });
  app.register(fastifyObservability, { apiKey: 'test_key', logger: false, ...opts } as Parameters<typeof fastifyObservability>[1]);
  app.get('/hello', async () => ({ ok: true }));
  app.get('/fail',  async (_req, rep) => rep.status(500).send({ error: 'boom' }));
  app.get('/skip',  async () => ({ skipped: true }));
  await app.ready();
  return app;
}

describe('fastifyObservability — basics', () => {
  let app: FastifyApp;

  beforeEach(async () => {
    resetMetrics();
    app = await buildApp();
  });

  afterEach(() => app.close());

  it('passes requests through', async () => {
    const res = await app.inject({ method: 'GET', url: '/hello' });
    expect(res.statusCode).toBe(200);
  });

  it('adds x-trace-id response header', async () => {
    const res = await app.inject({ method: 'GET', url: '/hello' });
    expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('propagates incoming trace ID', async () => {
    const traceId = 'aaaa-1111-2222-3333-bbbb';
    const res = await app.inject({ method: 'GET', url: '/hello', headers: { 'x-trace-id': traceId } });
    expect(res.headers['x-trace-id']).toBe(traceId);
  });

  it('records success metric for 2xx', async () => {
    await app.inject({ method: 'GET', url: '/hello' });
    expect(getMetrics().successRequests).toBe(1);
    expect(getMetrics().totalRequests).toBe(1);
  });

  it('records error metric for 5xx', async () => {
    await app.inject({ method: 'GET', url: '/fail' });
    expect(getMetrics().errorRequests).toBe(1);
    expect(getMetrics().successRequests).toBe(0);
  });
});

describe('fastifyObservability — skipRoutes', () => {
  let app: FastifyApp;

  beforeEach(async () => {
    resetMetrics();
    app = await buildApp({ skipRoutes: ['/skip'] });
  });

  afterEach(() => app.close());

  it('skips metric recording for listed routes', async () => {
    await app.inject({ method: 'GET', url: '/skip' });
    await app.inject({ method: 'GET', url: '/hello' });
    expect(getMetrics().totalRequests).toBe(1);
  });
});

describe('fastifyObservability — callbacks', () => {
  it('calls onRequest and onResponse', async () => {
    resetMetrics();
    let onRequestCalled = false;
    let onResponseEntry: unknown = null;

    const app = await buildApp({
      onRequest:  () => { onRequestCalled = true; },
      onResponse: (e) => { onResponseEntry = e; },
    });
    await app.inject({ method: 'GET', url: '/hello' });
    await app.close();

    expect(onRequestCalled).toBe(true);
    expect(onResponseEntry).not.toBeNull();
  });
});

describe('fastifyObservability — slow threshold', () => {
  it('marks request as slow when latency exceeds threshold', async () => {
    resetMetrics();
    const app = Fastify({ logger: false }) as FastifyApp;
    app.register(fastifyObservability, { apiKey: 'test_key', logger: false, slowThreshold: 1 } as Parameters<typeof fastifyObservability>[1]);
    app.get('/slow', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { done: true };
    });
    await app.ready();

    await app.inject({ method: 'GET', url: '/slow' });
    expect(getMetrics().slowRequests).toBe(1);
    await app.close();
  });
});

describe('fastifyObservability — logs entries for handlers that throw', () => {
  // Fastify's onResponse hook fires regardless of whether the route handler
  // threw, so this should already work — but assert it explicitly as a
  // regression guard for the class of bug found in Koa/NestJS/Elysia (a
  // hook/lifecycle point that only fires on the success path).
  it('logs a request whose handler throws an uncaught error', async () => {
    resetMetrics();
    const entries: unknown[] = [];
    const app = Fastify({ logger: false }) as FastifyApp;
    app.register(fastifyObservability, { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) } as Parameters<typeof fastifyObservability>[1]);
    app.get('/boom', async () => { throw new Error('boom'); });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
    await app.close();
  });
});
