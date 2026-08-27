/**
 * Integration tests for withNextObservability. Invokes the wrapped handler
 * directly against fake req/res objects, matching how Next.js's API route
 * resolver actually calls a handler — no full Next.js app needed since this
 * middleware only wraps a plain (req, res) => void function.
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { withObservability as withNextObservability, withAppRouterObservability } from '../../src/middleware/nextjs';

type FakeRes = EventEmitter & {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  getHeader: (k: string) => unknown;
  end: (...args: unknown[]) => void;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
};

function makeReqRes(method: string, url: string) {
  const req = { method, url, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = new EventEmitter() as FakeRes;
  res.statusCode = 200;
  res.setHeader = () => {};
  res.getHeader = () => undefined;
  res.end = function (...args: unknown[]) { this.emit('finish'); return res; };
  res.status = function (code: number) { res.statusCode = code; return res; };
  res.json = function (body: unknown) { res.end(JSON.stringify(body)); return res; };
  return { req, res };
}

describe('withNextObservability — basics', () => {
  it('logs a successful request with status 200', async () => {
    const entries: unknown[] = [];
    const handler = withNextObservability(
      async (_req, res) => { (res as FakeRes).status(200).json({ ok: true }); },
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    const { req, res } = makeReqRes('GET', '/api/health');
    await handler(req, res);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
  });
});

describe('withNextObservability — logs entries for handlers that throw', () => {
  // withNextObservability hooks res.end() (same pattern as Express), so the
  // entry is only logged once something calls res.end() on the (patched)
  // response — matching real Next.js behavior, where an uncaught API route
  // handler error is caught by Next.js's own resolver, which still sends
  // its own error response through the same res object.
  it('logs the request once Next.js sends its own error response after the handler throws', async () => {
    const entries: unknown[] = [];
    const handler = withNextObservability(
      async () => { throw new Error('boom'); },
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    const { req, res } = makeReqRes('GET', '/api/boom');
    let threw = false;
    try {
      await handler(req, res);
    } catch {
      threw = true;
      // What Next.js's own API resolver does when a handler throws uncaught.
      (res as FakeRes).status(500).json({ error: 'Internal Server Error' });
    }

    expect(threw).toBe(true);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
  });
});

/**
 * App Router route handlers get a real Fetch API `Request` and a
 * `{ params }` context — no (req, res) pair — invoked positionally exactly
 * like this by Next.js's own resolver. Regression guard for the previous
 * bug where withObservability (built for Pages Router) crashed immediately
 * with "res.setHeader is not a function" when used this way.
 */
describe('withAppRouterObservability — basics', () => {
  it('logs a successful request with status 200 and returns a working Response', async () => {
    const entries: unknown[] = [];
    const handler = withAppRouterObservability(
      async (_request) => Response.json({ ok: true }),
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    const request = new Request('http://localhost/api/hello');
    const response = await handler(request, { params: {} });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
  });

  it('adds the trace header to the returned response', async () => {
    const handler = withAppRouterObservability(
      async () => Response.json({ ok: true }),
      { apiKey: 'test_key', logger: false },
    );

    const request = new Request('http://localhost/api/hello');
    const response = await handler(request, { params: {} });

    expect(response.headers.get('x-trace-id')).toBeTruthy();
  });

  it('forwards dynamic route params to the handler untouched', async () => {
    const handler = withAppRouterObservability(
      async (_request, context: { params?: unknown }) => Response.json({ params: context.params }),
      { apiKey: 'test_key', logger: false },
    );

    const request = new Request('http://localhost/api/users/42');
    const response = await handler(request, { params: { id: '42' } });

    expect(await response.json()).toEqual({ params: { id: '42' } });
  });

  it('logs a request whose handler throws with status 500, and re-throws', async () => {
    const entries: unknown[] = [];
    const handler = withAppRouterObservability(
      async () => { throw new Error('boom'); },
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    const request = new Request('http://localhost/api/boom');
    await expect(handler(request, { params: {} })).rejects.toThrow('boom');

    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
  });
});
