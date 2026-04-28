import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shipStartupEvent, startProcessMetrics, captureUnhandledErrors } from '../../src/core/process-monitor';
import type { LogEntry } from '../../src/types';

function makeMockShipper() {
  const pushed: LogEntry[] = [];
  return {
    push: (entry: LogEntry) => pushed.push(entry),
    pushed,
  };
}

describe('shipStartupEvent', () => {
  it('pushes one event with method _process and route startup', () => {
    const shipper = makeMockShipper();
    shipStartupEvent(shipper as any, {});
    expect(shipper.pushed).toHaveLength(1);
    const ev = shipper.pushed[0];
    expect(ev.method).toBe('_process');
    expect(ev.route).toBe('startup');
  });

  it('includes nodeVersion, hostname, pid', () => {
    const shipper = makeMockShipper();
    shipStartupEvent(shipper as any, {});
    const ev = shipper.pushed[0] as Record<string, unknown>;
    expect(ev.nodeVersion).toBe(process.version);
    expect(typeof ev.hostname).toBe('string');
    expect(ev.pid).toBe(process.pid);
  });

  it('attaches provided tags', () => {
    const shipper = makeMockShipper();
    shipStartupEvent(shipper as any, { service: 'api', env: 'test' });
    const ev = shipper.pushed[0];
    expect(ev.tags).toEqual({ service: 'api', env: 'test' });
  });
});

describe('startProcessMetrics', () => {
  it('pushes a metrics event after interval fires', async () => {
    vi.useFakeTimers();
    const shipper = makeMockShipper();
    const timer = startProcessMetrics(shipper as any, {}, 1000);
    vi.advanceTimersByTime(1000);
    expect(shipper.pushed).toHaveLength(1);
    const ev = shipper.pushed[0] as Record<string, unknown>;
    expect(ev.method).toBe('_process');
    expect(ev.route).toBe('metrics');
    expect(typeof ev.heapUsed).toBe('number');
    expect(typeof ev.rss).toBe('number');
    clearInterval(timer);
    vi.useRealTimers();
  });

  it('pushes multiple events over multiple intervals', () => {
    vi.useFakeTimers();
    const shipper = makeMockShipper();
    const timer = startProcessMetrics(shipper as any, {}, 500);
    vi.advanceTimersByTime(1500);
    expect(shipper.pushed.length).toBeGreaterThanOrEqual(3);
    clearInterval(timer);
    vi.useRealTimers();
  });
});

describe('captureUnhandledErrors', () => {
  afterEach(() => {
    // Remove listeners added during tests to avoid interference
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('registers uncaughtException listener', () => {
    const before = process.listenerCount('uncaughtException');
    const shipper = makeMockShipper();
    captureUnhandledErrors(shipper as any, {});
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
  });

  it('registers unhandledRejection listener', () => {
    const before = process.listenerCount('unhandledRejection');
    const shipper = makeMockShipper();
    captureUnhandledErrors(shipper as any, {});
    expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
  });

  it('ships an event when uncaughtException fires', () => {
    const shipper = makeMockShipper();
    captureUnhandledErrors(shipper as any, { service: 'test' });
    process.emit('uncaughtException', new Error('boom') as Error & { origin?: string }, 'uncaughtException');
    expect(shipper.pushed).toHaveLength(1);
    const ev = shipper.pushed[0] as Record<string, unknown>;
    expect(ev.method).toBe('_process');
    expect(ev.route).toBe('uncaughtException');
    expect(ev.status).toBe(500);
    expect(ev.errorMessage).toBe('boom');
  });

  it('ships an event when unhandledRejection fires', () => {
    const shipper = makeMockShipper();
    captureUnhandledErrors(shipper as any, {});
    process.emit('unhandledRejection', new Error('rejected'), Promise.resolve());
    expect(shipper.pushed).toHaveLength(1);
    const ev = shipper.pushed[0] as Record<string, unknown>;
    expect(ev.route).toBe('unhandledRejection');
    expect(ev.errorMessage).toBe('rejected');
  });
});
