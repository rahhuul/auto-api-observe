import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { storage, createDbCalls } from '../../src/core/storage';
import { autoInstrument } from '../../src/core/instrument';
import type { RequestContext } from '../../src/types';

function makeContext(): RequestContext {
  return { traceId: 'trace-nf', startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

// node-fetch v2's module.exports IS the fetch function itself (unlike
// undici, which exposes a `.fetch` property on an object) — these tests
// confirm the patch actually intercepts calls made the way real consumers
// (e.g. an SDK built on node-fetch, like Square's) call it: both
// `require('node-fetch')` used directly, and via `.default`.
describe('autoInstrument — node-fetch patching', () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    server = createServer((_req, res) => { res.statusCode = 204; res.end(); });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    autoInstrument(true);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('records a successful call made via the raw require("node-fetch") export', async () => {
    const fetchFn = require('node-fetch') as (url: string) => Promise<{ status: number }>;

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      const res = await fetchFn(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(204);
      expect(ctx.outboundCalls).toHaveLength(1);
      expect(ctx.outboundCalls![0].method).toBe('GET');
      expect(ctx.outboundCalls![0].status).toBe(204);
      expect(ctx.outboundCalls![0].url).toContain(`127.0.0.1:${port}`);
    });
  });

  it('records a successful call made via the `.default` property', async () => {
    const nodeFetch = require('node-fetch') as { default: (url: string) => Promise<{ status: number }> };

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      const res = await nodeFetch.default(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(204);
      expect(ctx.outboundCalls).toHaveLength(1);
    });
  });

  it('records a failed call (connection refused) with status 0', async () => {
    const fetchFn = require('node-fetch') as (url: string) => Promise<unknown>;

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      try {
        await fetchFn('http://127.0.0.1:19999/noop');
      } catch {
        // expected — nothing listening on that port
      }
      expect(ctx.outboundCalls).toHaveLength(1);
      expect(ctx.outboundCalls![0].status).toBe(0);
    });
  });
});
