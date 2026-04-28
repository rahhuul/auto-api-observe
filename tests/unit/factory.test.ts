import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setup, buildEntry, finalize, warnNoApiKey } from '../../src/core/factory';
import { storage, createDbCalls } from '../../src/core/storage';
import type { RequestContext } from '../../src/types';

function makeContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    traceId:       'test-trace',
    startTime:     Date.now() - 50,
    dbCalls:       0,
    dbCallsDetail: createDbCalls(),
    customFields:  {},
    ...overrides,
  };
}

// ─── warnNoApiKey ─────────────────────────────────────────────────────────────

describe('warnNoApiKey', () => {
  it('prints to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnNoApiKey();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('apilens.rest');
    spy.mockRestore();
  });
});

// ─── setup — no apiKey ────────────────────────────────────────────────────────

describe('setup — no apiKey', () => {
  it('returns null and warns when apiKey is missing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = setup({ logger: false });
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('returns null when apiKey is empty string', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = setup({ apiKey: '', logger: false });
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// ─── setup — with apiKey ──────────────────────────────────────────────────────

describe('setup — with apiKey', () => {
  it('returns resolved options with defaults', () => {
    const opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false });
    expect(opts).not.toBeNull();
    expect(opts!.slowThreshold).toBe(1000);
    expect(opts!.sampleRate).toBe(1.0);
    expect(opts!.maxRoutes).toBe(1000);
    expect(opts!.traceHeader).toBe('x-trace-id');
    expect(opts!.tags).toEqual({});
  });

  it('applies custom tags', () => {
    const tags = { service: 'api', env: 'test' };
    const opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false, tags });
    expect(opts!.tags).toEqual(tags);
  });

  it('respects custom slowThreshold', () => {
    const opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false, slowThreshold: 500 });
    expect(opts!.slowThreshold).toBe(500);
  });
});

// ─── buildEntry ───────────────────────────────────────────────────────────────

describe('buildEntry', () => {
  let opts: ReturnType<typeof setup>;

  beforeEach(() => {
    opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false });
  });

  it('populates all core fields', () => {
    const ctx   = makeContext();
    const entry = buildEntry(opts!, ctx, 'GET', '/users/:id', '/users/42', 200, '1.2.3.4', 'Mozilla/5.0');
    expect(entry.method).toBe('GET');
    expect(entry.route).toBe('/users/:id');
    expect(entry.path).toBe('/users/42');
    expect(entry.status).toBe(200);
    expect(entry.ip).toBe('1.2.3.4');
    expect(entry.userAgent).toBe('Mozilla/5.0');
    expect(typeof entry.latency).toBe('number');
    expect(entry.latencyMs).toMatch(/^\d+ms$/);
  });

  it('marks slow requests correctly', () => {
    const fastCtx = makeContext({ startTime: Date.now() - 10 });
    const slowCtx = makeContext({ startTime: Date.now() - 2000 });
    expect(buildEntry(opts!, fastCtx, 'GET', '/', '/', 200, '', undefined).slow).toBe(false);
    expect(buildEntry(opts!, slowCtx, 'GET', '/', '/', 200, '', undefined).slow).toBe(true);
  });

  it('includes requestSize and responseSize from extras', () => {
    const ctx   = makeContext();
    const entry = buildEntry(opts!, ctx, 'POST', '/data', '/data', 201, '', undefined, { requestSize: 1024, responseSize: 256 });
    expect(entry.requestSize).toBe(1024);
    expect(entry.responseSize).toBe(256);
  });

  it('omits requestSize/responseSize when not provided', () => {
    const ctx   = makeContext();
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry.requestSize).toBeUndefined();
    expect(entry.responseSize).toBeUndefined();
  });

  it('attaches global tags to entry', () => {
    const taggedOpts = setup({ apiKey: 'test_key', logger: false, processMetrics: false, tags: { service: 'user-api', env: 'prod' } });
    const entry = buildEntry(taggedOpts!, makeContext(), 'GET', '/', '/', 200, '', undefined);
    expect(entry.tags).toEqual({ service: 'user-api', env: 'prod' });
  });

  it('omits tags field when tags is empty object', () => {
    const entry = buildEntry(opts!, makeContext(), 'GET', '/', '/', 200, '', undefined);
    expect(entry.tags).toBeUndefined();
  });

  it('includes outboundCalls when present', () => {
    const ctx = makeContext({ outboundCalls: [{ method: 'GET', url: 'https://api.example.com/v1', status: 200, latency: 120 }] });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry.outboundCalls).toHaveLength(1);
    expect(entry.outboundCalls![0].url).toBe('https://api.example.com/v1');
  });

  it('omits outboundCalls when empty', () => {
    const entry = buildEntry(opts!, makeContext(), 'GET', '/', '/', 200, '', undefined);
    expect(entry.outboundCalls).toBeUndefined();
  });
});

// ─── Sensitive field masking ──────────────────────────────────────────────────

describe('buildEntry — sensitive field masking', () => {
  let opts: ReturnType<typeof setup>;

  beforeEach(() => {
    opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false });
  });

  it('redacts authorization from customFields', () => {
    const ctx   = makeContext({ customFields: { authorization: 'Bearer secret123' } });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry['authorization']).toBe('[REDACTED]');
  });

  it('redacts password from customFields', () => {
    const ctx   = makeContext({ customFields: { password: 'hunter2' } });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry['password']).toBe('[REDACTED]');
  });

  it('redacts token, api_key, cookie', () => {
    const ctx   = makeContext({ customFields: { token: 'abc', api_key: 'xyz', cookie: 'session=1' } });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry['token']).toBe('[REDACTED]');
    expect(entry['api_key']).toBe('[REDACTED]');
    expect(entry['cookie']).toBe('[REDACTED]');
  });

  it('does not redact non-sensitive fields', () => {
    const ctx   = makeContext({ customFields: { userId: 'u123', plan: 'pro', region: 'us-east' } });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry['userId']).toBe('u123');
    expect(entry['plan']).toBe('pro');
    expect(entry['region']).toBe('us-east');
  });

  it('redact is case-insensitive on key', () => {
    const ctx   = makeContext({ customFields: { Authorization: 'Bearer x', PASSWORD: 'secret' } });
    const entry = buildEntry(opts!, ctx, 'GET', '/', '/', 200, '', undefined);
    expect(entry['Authorization']).toBe('[REDACTED]');
    expect(entry['PASSWORD']).toBe('[REDACTED]');
  });
});

// ─── finalize ─────────────────────────────────────────────────────────────────

describe('finalize', () => {
  it('calls logger with the entry', () => {
    const logged: unknown[] = [];
    const opts = setup({ apiKey: 'test_key', logger: (e) => logged.push(e), processMetrics: false })!;
    const entry = buildEntry(opts, makeContext(), 'GET', '/', '/', 200, '', undefined);
    finalize(opts, entry);
    expect(logged).toHaveLength(1);
    expect((logged[0] as typeof entry).route).toBe('/');
  });

  it('skips logger when logger is false', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false })!;
    const entry = buildEntry(opts, makeContext(), 'GET', '/', '/', 200, '', undefined);
    finalize(opts, entry);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls onResponse callback', () => {
    let called = false;
    const opts = setup({ apiKey: 'test_key', logger: false, processMetrics: false, onResponse: () => { called = true; } })!;
    finalize(opts, buildEntry(opts, makeContext(), 'GET', '/', '/', 200, '', undefined));
    expect(called).toBe(true);
  });
});
