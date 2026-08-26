/**
 * Integration tests for createRestifyMiddleware (re-exports createExpressMiddleware).
 * Restify's req/res objects aren't identical to Express's even though the
 * middleware signature matches, so this is verified against a real Restify
 * server rather than assumed from the Express tests.
 */
import { describe, it, expect } from 'vitest';
import restify from 'restify';
import { createRestifyMiddleware } from '../../src/middleware/restify';
import { request } from './helpers/http';

function buildServer(entries: unknown[]): restify.Server {
  const server = restify.createServer();
  server.use(createRestifyMiddleware({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
  server.get('/hello', (_req, res, next) => { res.json({ ok: true }); next(); });
  server.get('/boom', (_req, _res, next) => { next(new Error('boom')); });
  return server;
}

describe('createRestifyMiddleware — basics', () => {
  it('passes requests through and logs a successful entry', async () => {
    const entries: unknown[] = [];
    const server = buildServer(entries);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const res = await request(server.server, { path: '/hello' });
    expect(res.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
    server.close();
  });
});

describe('createRestifyMiddleware — logs entries for handlers that error', () => {
  it('logs a request whose handler errors with status 500', async () => {
    const entries: unknown[] = [];
    const server = buildServer(entries);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const res = await request(server.server, { path: '/boom' });
    expect(res.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
    server.close();
  });
});
