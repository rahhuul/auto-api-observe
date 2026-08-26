/**
 * Integration tests for koaObservability. Uses a real Koa app + real HTTP server.
 */
import { describe, it, expect } from 'vitest';
import Koa from 'koa';
import http from 'http';
import { koaObservability } from '../../src/middleware/koa';
import { request } from './helpers/http';

function startServer(app: Koa): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

describe('koaObservability — basics', () => {
  it('passes requests through and logs a successful entry', async () => {
    const entries: unknown[] = [];
    const app = new Koa();
    app.use(koaObservability({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
    app.use((ctx) => { ctx.body = { ok: true }; });
    const server = await startServer(app);

    const res = await request(server, { path: '/hello' });
    expect(res.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
    server.close();
  });

  it('adds trace header', async () => {
    const app = new Koa();
    app.use(koaObservability({ apiKey: 'test_key', logger: false }));
    app.use((ctx) => { ctx.body = { ok: true }; });
    const server = await startServer(app);

    const res = await request(server, { path: '/hello' });
    expect(res.headers['x-trace-id']).toMatch(/^[0-9a-f-]{36}$/i);
    server.close();
  });
});

describe('koaObservability — logs entries for handlers that throw', () => {
  // Regression guard: koaObservabilityMiddleware used to `await next()`
  // with no try/catch, so a rejected/thrown downstream middleware skipped
  // the log-building code entirely — the request's entry never got logged
  // even though Koa itself still sent a 500 response to the client.
  it('logs a request whose handler throws, with the correct eventual status', async () => {
    const entries: unknown[] = [];
    const app = new Koa();
    app.use(koaObservability({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
    app.use(() => { throw new Error('boom'); });
    const server = await startServer(app);

    const res = await request(server, { path: '/boom' });
    expect(res.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
    server.close();
  });

  it('re-throws so Koa error handling is unaffected (does not swallow the error)', async () => {
    let koaEmittedError: unknown = null;
    const app = new Koa();
    app.on('error', (err) => { koaEmittedError = err; });
    app.use(koaObservability({ apiKey: 'test_key', logger: false }));
    app.use(() => { throw new Error('boom'); });
    const server = await startServer(app);

    await request(server, { path: '/boom' });
    expect(koaEmittedError).not.toBeNull();
    expect((koaEmittedError as Error).message).toBe('boom');
    server.close();
  });
});
