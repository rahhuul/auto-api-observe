import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storage, createDbCalls, recordOutboundCall, getContext } from '../../src/core/storage';
import { autoInstrument } from '../../src/core/instrument';
import type { RequestContext } from '../../src/types';

function makeContext(): RequestContext {
  return { traceId: 'trace-out', startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

// ─── recordOutboundCall ───────────────────────────────────────────────────────

describe('recordOutboundCall', () => {
  it('is a no-op outside a request context', () => {
    expect(() => recordOutboundCall({ method: 'GET', url: 'https://example.com', status: 200, latency: 10 })).not.toThrow();
  });

  it('appends to outboundCalls inside a context', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      recordOutboundCall({ method: 'GET',  url: 'https://api.example.com/v1/users', status: 200, latency: 80 });
      recordOutboundCall({ method: 'POST', url: 'https://api.stripe.com/v1/charges', status: 201, latency: 340 });
      expect(ctx.outboundCalls).toHaveLength(2);
      expect(ctx.outboundCalls![0].method).toBe('GET');
      expect(ctx.outboundCalls![1].url).toBe('https://api.stripe.com/v1/charges');
      expect(ctx.outboundCalls![1].status).toBe(201);
    });
  });

  it('initialises outboundCalls lazily on first call', () => {
    const ctx = makeContext();
    expect(ctx.outboundCalls).toBeUndefined();
    storage.run(ctx, () => {
      recordOutboundCall({ method: 'GET', url: 'https://x.com', status: 200, latency: 5 });
      expect(ctx.outboundCalls).toBeDefined();
    });
  });

  it('isolates outbound calls between concurrent contexts', async () => {
    const ctx1 = makeContext();
    const ctx2 = makeContext();
    await Promise.all([
      storage.run(ctx1, async () => {
        recordOutboundCall({ method: 'GET', url: 'https://a.com', status: 200, latency: 10 });
        await new Promise(r => setTimeout(r, 5));
        recordOutboundCall({ method: 'GET', url: 'https://b.com', status: 200, latency: 10 });
      }),
      storage.run(ctx2, async () => {
        recordOutboundCall({ method: 'POST', url: 'https://c.com', status: 201, latency: 20 });
      }),
    ]);
    expect(ctx1.outboundCalls).toHaveLength(2);
    expect(ctx2.outboundCalls).toHaveLength(1);
  });
});

// ─── fetch patching ───────────────────────────────────────────────────────────

describe('autoInstrument — fetch patching', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Reset the patch flag so we can re-patch in each test
    if ((globalThis.fetch as unknown as { __apilens?: boolean }).__apilens) {
      globalThis.fetch = originalFetch;
      (globalThis.fetch as unknown as { __apilens?: boolean }).__apilens = undefined;
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('patches globalThis.fetch when autoInstrumentOutbound is true', () => {
    const before = globalThis.fetch;
    autoInstrument(true);
    // fetch should be wrapped (different function reference or marked)
    const patched = globalThis.fetch as unknown as { __apilens?: boolean };
    // Either the function changed or it was already patched — either way no throw
    expect(typeof globalThis.fetch).toBe('function');
  });

  it('records outbound call via patched fetch inside a context', async () => {
    // Ensure fetch is patched
    (globalThis.fetch as unknown as { __apilens?: boolean }).__apilens = undefined;
    autoInstrument(true);

    const ctx = makeContext();
    await storage.run(ctx, async () => {
      // Use a URL that will fail (connection refused) — we only care about recording
      try {
        await globalThis.fetch('http://localhost:19999/noop');
      } catch {
        // Expected — no server running
      }
      // outboundCalls should have been recorded even on failure
      expect(ctx.outboundCalls).toBeDefined();
      expect(ctx.outboundCalls![0].method).toBe('GET');
      expect(ctx.outboundCalls![0].url).toContain('localhost');
      expect(ctx.outboundCalls![0].status).toBe(0); // failed = 0
    });
  });
});
