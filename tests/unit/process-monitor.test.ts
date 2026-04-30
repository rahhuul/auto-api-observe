import { describe, it, expect, vi, afterEach } from 'vitest';
import { shipStartupEvent, startProcessMetrics, captureUnhandledErrors } from '../../src/core/process-monitor';

function makeMockClient() {
  const sent: Record<string, unknown>[] = [];
  return {
    send: (data: object) => sent.push(data as Record<string, unknown>),
    sent,
  };
}

describe('shipStartupEvent', () => {
  it('sends one event with type startup', () => {
    const client = makeMockClient();
    shipStartupEvent(client as any, {});
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0].type).toBe('startup');
  });

  it('includes nodeVersion, hostname, pid', () => {
    const client = makeMockClient();
    shipStartupEvent(client as any, {});
    const ev = client.sent[0];
    expect(ev.nodeVersion).toBe(process.version);
    expect(typeof ev.hostname).toBe('string');
    expect(ev.pid).toBe(process.pid);
  });

  it('attaches provided tags', () => {
    const client = makeMockClient();
    shipStartupEvent(client as any, { service: 'api', env: 'test' });
    expect(client.sent[0].tags).toEqual({ service: 'api', env: 'test' });
  });
});

describe('startProcessMetrics', () => {
  it('sends a metrics event after interval fires', async () => {
    vi.useFakeTimers();
    const client = makeMockClient();
    const timer = startProcessMetrics(client as any, {}, 1000);
    vi.advanceTimersByTime(1000);
    expect(client.sent).toHaveLength(1);
    const ev = client.sent[0];
    expect(ev.type).toBe('metrics');
    expect(typeof ev.heapUsed).toBe('number');
    expect(typeof ev.rss).toBe('number');
    clearInterval(timer);
    vi.useRealTimers();
  });

  it('sends multiple events over multiple intervals', () => {
    vi.useFakeTimers();
    const client = makeMockClient();
    const timer = startProcessMetrics(client as any, {}, 500);
    vi.advanceTimersByTime(1500);
    expect(client.sent.length).toBeGreaterThanOrEqual(3);
    clearInterval(timer);
    vi.useRealTimers();
  });
});

describe('captureUnhandledErrors', () => {
  afterEach(() => {
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('registers uncaughtException listener', () => {
    const before = process.listenerCount('uncaughtException');
    captureUnhandledErrors(makeMockClient() as any, {});
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
  });

  it('registers unhandledRejection listener', () => {
    const before = process.listenerCount('unhandledRejection');
    captureUnhandledErrors(makeMockClient() as any, {});
    expect(process.listenerCount('unhandledRejection')).toBe(before + 1);
  });

  it('ships an event when uncaughtException fires', () => {
    const client = makeMockClient();
    captureUnhandledErrors(client as any, { service: 'test' });
    process.emit('uncaughtException', new Error('boom') as Error & { origin?: string }, 'uncaughtException');
    expect(client.sent).toHaveLength(1);
    const ev = client.sent[0];
    expect(ev.type).toBe('uncaughtException');
    expect(ev.errorMessage).toBe('boom');
    expect(ev.tags).toEqual({ service: 'test' });
  });

  it('ships an event when unhandledRejection fires', () => {
    const client = makeMockClient();
    captureUnhandledErrors(client as any, {});
    process.emit('unhandledRejection', new Error('rejected'), Promise.resolve());
    expect(client.sent).toHaveLength(1);
    const ev = client.sent[0];
    expect(ev.type).toBe('unhandledRejection');
    expect(ev.errorMessage).toBe('rejected');
  });
});
