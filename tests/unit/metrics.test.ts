import { describe, it, expect, beforeEach } from 'vitest';
import { recordMetric, getMetrics, resetMetrics } from '../../src/core/metrics';
import type { LogEntry } from '../../src/types';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp:  new Date().toISOString(),
    traceId:    'trace-abc',
    method:     'GET',
    route:      '/api/test',
    path:       '/api/test',
    status:     200,
    latency:    50,
    latencyMs:  '50ms',
    dbCalls:    { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] },
    slow:       false,
    ip:         '127.0.0.1',
    userAgent:  'test-agent',
    ...overrides,
  };
}

describe('metrics', () => {
  beforeEach(() => resetMetrics());

  it('starts at zero after reset', () => {
    const m = getMetrics();
    expect(m.totalRequests).toBe(0);
    expect(m.successRequests).toBe(0);
    expect(m.clientErrorRequests).toBe(0);
    expect(m.errorRequests).toBe(0);
    expect(m.slowRequests).toBe(0);
    expect(Object.keys(m.routes)).toHaveLength(0);
  });

  it('counts a 2xx as a success', () => {
    recordMetric(makeEntry({ status: 200 }));
    const m = getMetrics();
    expect(m.totalRequests).toBe(1);
    expect(m.successRequests).toBe(1);
    expect(m.clientErrorRequests).toBe(0);
    expect(m.errorRequests).toBe(0);
  });

  it('counts a 4xx as a clientError (not errorRequests)', () => {
    recordMetric(makeEntry({ status: 404 }));
    const m = getMetrics();
    expect(m.totalRequests).toBe(1);
    expect(m.successRequests).toBe(0);
    expect(m.clientErrorRequests).toBe(1);
    expect(m.errorRequests).toBe(0);
  });

  it('counts a 5xx as an error', () => {
    recordMetric(makeEntry({ status: 500 }));
    const m = getMetrics();
    expect(m.errorRequests).toBe(1);
    expect(m.clientErrorRequests).toBe(0);
    expect(m.successRequests).toBe(0);
  });

  it('increments slowRequests when slow=true', () => {
    recordMetric(makeEntry({ slow: false }));
    recordMetric(makeEntry({ slow: true }));
    expect(getMetrics().slowRequests).toBe(1);
  });

  it('tracks per-route metrics', () => {
    recordMetric(makeEntry({ method: 'GET', route: '/api/users', latency: 40 }));
    recordMetric(makeEntry({ method: 'GET', route: '/api/users', latency: 60, status: 500 }));

    const m = getMetrics();
    const r = m.routes['GET /api/users'];
    expect(r).toBeDefined();
    expect(r.count).toBe(2);
    expect(r.avgLatency).toBe(50);    // (40 + 60) / 2
    expect(r.minLatency).toBe(40);
    expect(r.maxLatency).toBe(60);
    expect(r.errors).toBe(1);
  });

  it('respects maxRoutes cap', () => {
    // Fill exactly maxRoutes distinct routes
    const maxRoutes = 3;
    for (let i = 0; i < maxRoutes; i++) {
      recordMetric(makeEntry({ route: `/route/${i}` }), maxRoutes);
    }
    // One more should be silently ignored
    recordMetric(makeEntry({ route: '/overflow' }), maxRoutes);

    const routes = Object.keys(getMetrics().routes);
    expect(routes).toHaveLength(maxRoutes);
    expect(routes.some((r) => r.includes('overflow'))).toBe(false);
  });

  it('resetMetrics clears all counters and routes', () => {
    recordMetric(makeEntry());
    resetMetrics();
    const m = getMetrics();
    expect(m.totalRequests).toBe(0);
    expect(Object.keys(m.routes)).toHaveLength(0);
  });

  it('uptime is a non-negative number', () => {
    expect(getMetrics().uptime).toBeGreaterThanOrEqual(0);
  });
});

// Override the internal recordMetric signature to pass maxRoutes for the cap test
declare module '../../src/core/metrics' {
  export function recordMetric(entry: LogEntry, maxRoutes?: number): void;
}
