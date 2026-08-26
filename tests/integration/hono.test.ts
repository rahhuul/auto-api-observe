/**
 * Integration tests for honoObservability. Uses a real Hono app + real HTTP server.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { honoObservability } from '../../src/middleware/hono';
import { request } from './helpers/http';

async function startServer(app: Hono): Promise<ServerType> {
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((r) => setTimeout(r, 50));
  return server as ServerType;
}

describe('honoObservability — basics', () => {
  it('passes requests through and logs a successful entry', async () => {
    const entries: unknown[] = [];
    const app = new Hono();
    app.use('*', honoObservability({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
    app.get('/hello', (c) => c.json({ ok: true }));
    const server = await startServer(app);

    // @hono/node-server's returned server is a plain node http.Server under the hood
    const res = await request(server as unknown as import('http').Server, { path: '/hello' });
    expect(res.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
    server.close();
  });
});

describe('honoObservability — logs entries for handlers that throw', () => {
  // Hono's own internal dispatcher catches a thrown handler error and turns
  // it into a Response BEFORE returning control to our middleware's
  // `await next()` — unlike Koa, it never rejects up to us. Regression
  // guard so this stays true across Hono versions.
  it('logs a request whose handler throws, with an error status', async () => {
    const entries: unknown[] = [];
    const app = new Hono();
    app.use('*', honoObservability({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
    app.get('/boom', () => { throw new Error('boom'); });
    const server = await startServer(app);

    const res = await request(server as unknown as import('http').Server, { path: '/boom' });
    expect(res.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBeGreaterThanOrEqual(400);
    server.close();
  });
});
