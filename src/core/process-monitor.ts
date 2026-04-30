import * as os from 'os';
import type { WsProcessClient } from './ws-client';

function makeFrame(type: string, tags: Record<string, string>, extra: Record<string, unknown>): Record<string, unknown> {
  return { type, timestamp: new Date().toISOString(), tags, ...extra };
}

/** Ship a one-time startup event with runtime info over WebSocket. */
export function shipStartupEvent(client: WsProcessClient, tags: Record<string, string>): void {
  client.send(makeFrame('startup', tags, {
    nodeVersion: process.version,
    platform:    process.platform,
    arch:        process.arch,
    hostname:    os.hostname(),
    pid:         process.pid,
    env:         process.env.NODE_ENV ?? 'development',
    totalMemory: os.totalmem(),
    cpuCount:    os.cpus().length,
  }));
}

/** Start a repeating timer that ships memory + CPU snapshots over WebSocket. */
export function startProcessMetrics(
  client:     WsProcessClient,
  tags:       Record<string, string>,
  intervalMs: number,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    client.send(makeFrame('metrics', tags, {
      rss:        mem.rss,
      heapUsed:   mem.heapUsed,
      heapTotal:  mem.heapTotal,
      external:   mem.external,
      cpuUser:    cpu.user,
      cpuSystem:  cpu.system,
      loadAvg:    os.loadavg()[0],
      freeMemory: os.freemem(),
    }));
  }, intervalMs);

  if (timer.unref) timer.unref();
  return timer;
}

/**
 * Register listeners for uncaughtException and unhandledRejection.
 * Opt-in only — adding an uncaughtException listener changes Node's exit behaviour.
 */
export function captureUnhandledErrors(client: WsProcessClient, tags: Record<string, string>): void {
  process.on('uncaughtException', (err: Error) => {
    client.send(makeFrame('uncaughtException', tags, {
      errorName:    err.name,
      errorMessage: err.message,
      errorStack:   err.stack,
    }));
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : null;
    client.send(makeFrame('unhandledRejection', tags, {
      errorName:    err?.name    ?? 'UnhandledRejection',
      errorMessage: err?.message ?? String(reason),
      errorStack:   err?.stack,
    }));
  });
}
