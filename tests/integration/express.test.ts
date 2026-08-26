/**
 * Integration tests for createExpressMiddleware.
 * Spins up a lightweight Express server for each test suite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createExpressMiddleware } from '../../src/middleware/express';
import { resetMetrics, getMetrics } from '../../src/core/metrics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function request(
  server: http.Server,
  opts: { method?: string; path: string; headers?: Record<string, string> }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path: opts.path, method: opts.method ?? 'GET', headers: opts.headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers as Record<string, string>, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function startServer(app: express.Application): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createExpressMiddleware — basics', () => {
  let server: http.Server;

  beforeEach(async () => {
    resetMetrics();
    const app = express();
    app.use(createExpressMiddleware({ apiKey: 'test_key', logger: false }));
    app.get('/hello', (_req, res) => res.json({ ok: true }));
    app.get('/fail',  (_req, res) => res.status(500).json({ error: 'boom' }));
    server = await startServer(app);
  });

  it('passes requests through', async () => {
    const res = await request(server, { path: '/hello' });
    expect(res.status).toBe(200);
    server.close();
  });

  it('adds x-trace-id response header', async () => {
    const res = await request(server, { path: '/hello' });
    expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/i);
    server.close();
  });

  it('propagates incoming trace ID', async () => {
    const traceId = 'aaaa-bbbb-cccc-dddd-eeee-ffff';
    const res = await request(server, { path: '/hello', headers: { 'x-trace-id': traceId } });
    expect(res.headers['x-trace-id']).toBe(traceId);
    server.close();
  });

  it('records metrics for successful request', async () => {
    await request(server, { path: '/hello' });
    const m = getMetrics();
    expect(m.totalRequests).toBe(1);
    expect(m.successRequests).toBe(1);
    expect(m.errorRequests).toBe(0);
    server.close();
  });

  it('records error metrics for 5xx', async () => {
    await request(server, { path: '/fail' });
    const m = getMetrics();
    expect(m.errorRequests).toBe(1);
    expect(m.successRequests).toBe(0);
    server.close();
  });
});

describe('createExpressMiddleware — logs entries for handlers that throw', () => {
  // Express hooks res.end() rather than relying on the handler completing
  // successfully, so a thrown error (caught by an error-handling middleware
  // that still sends a response) should still be logged. Regression guard
  // for the class of bug found in Koa/NestJS/Elysia: a naive
  // "log after next() resolves" implementation misses error requests
  // entirely.
  it('logs a request whose handler throws, once an error handler sends a response', async () => {
    const entries: unknown[] = [];
    const app = express();
    app.use(createExpressMiddleware({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
    app.get('/boom', () => { throw new Error('boom'); });
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });
    const server = await startServer(app);

    const res = await request(server, { path: '/boom' });
    expect(res.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
    server.close();
  });
});

describe('createExpressMiddleware — skipRoutes', () => {
  let server: http.Server;

  beforeEach(async () => {
    resetMetrics();
    const app = express();
    app.use(createExpressMiddleware({ apiKey: 'test_key', logger: false, skipRoutes: ['/health'] }));
    app.get('/health', (_req, res) => res.json({ up: true }));
    app.get('/api',    (_req, res) => res.json({ data: 1 }));
    server = await startServer(app);
  });

  it('skips metric recording for skipRoutes', async () => {
    await request(server, { path: '/health' });
    await request(server, { path: '/api' });
    const m = getMetrics();
    // Only /api should be counted
    expect(m.totalRequests).toBe(1);
    server.close();
  });
});

describe('createExpressMiddleware — callbacks', () => {
  let server: http.Server;

  it('calls onRequest at start and onResponse at end', async () => {
    let onRequestCalled = false;
    let onResponseEntry: unknown = null;

    const app = express();
    app.use(createExpressMiddleware({
      apiKey: 'test_key',
      logger: false,
      onRequest:  () => { onRequestCalled = true; },
      onResponse: (e) => { onResponseEntry = e; },
    }));
    app.get('/ping', (_req, res) => res.json({ pong: true }));
    server = await startServer(app);

    await request(server, { path: '/ping' });
    expect(onRequestCalled).toBe(true);
    expect(onResponseEntry).not.toBeNull();
    server.close();
  });
});

describe('createExpressMiddleware — slow threshold', () => {
  let server: http.Server;

  it('marks a deliberately slow request as slow', async () => {
    resetMetrics();
    const app = express();
    app.use(createExpressMiddleware({ apiKey: 'test_key', logger: false, slowThreshold: 1 }));
    app.get('/slow', (_req, res) => {
      // Force a small delay so latency > 1ms threshold
      setTimeout(() => res.json({ done: true }), 5);
    });
    server = await startServer(app);

    await request(server, { path: '/slow' });
    expect(getMetrics().slowRequests).toBe(1);
    server.close();
  });
});
