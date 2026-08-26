/**
 * Integration tests for hapiObservabilityPlugin. Uses a real Hapi server.
 */
import { describe, it, expect } from 'vitest';
import Hapi from '@hapi/hapi';
import { hapiObservabilityPlugin } from '../../src/middleware/hapi';
import { request } from './helpers/http';

async function buildServer(entries: unknown[]): Promise<Hapi.Server> {
  const server = Hapi.server({ port: 0, host: '127.0.0.1' });
  await server.register({
    plugin: hapiObservabilityPlugin,
    options: { apiKey: 'test_key', logger: false, onResponse: (e: unknown) => entries.push(e) },
  });
  server.route({ method: 'GET', path: '/hello', handler: () => ({ ok: true }) });
  server.route({ method: 'GET', path: '/boom', handler: () => { throw new Error('boom'); } });
  await server.start();
  return server;
}

describe('hapiObservabilityPlugin — basics', () => {
  it('passes requests through and logs a successful entry', async () => {
    const entries: unknown[] = [];
    const server = await buildServer(entries);

    const res = await request(server.listener, { path: '/hello' });
    expect(res.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
    await server.stop();
  });
});

describe('hapiObservabilityPlugin — logs entries for handlers that throw', () => {
  // Hapi's onPreResponse lifecycle point is guaranteed to fire for both
  // successful and Boom (error) responses by design, so this should already
  // work — asserted explicitly as a regression guard.
  it('logs a request whose handler throws, with status 500', async () => {
    const entries: unknown[] = [];
    const server = await buildServer(entries);

    const res = await request(server.listener, { path: '/boom' });
    expect(res.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
    await server.stop();
  });
});
