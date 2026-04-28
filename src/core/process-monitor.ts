import * as os from 'os';
import type { RemoteShipper } from './shipper';
import type { LogEntry, DbCalls } from '../types';

const EMPTY_DB: DbCalls = { calls: 0, totalTime: 0, slowestQuery: 0, queries: [] };

function makeProcessEvent(
  route: string,
  status: number,
  tags: Record<string, string>,
  extra: Record<string, unknown>,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    traceId:   `process:${route}`,
    method:    '_process',
    route,
    path:      route,
    status,
    latency:   0,
    latencyMs: '0ms',
    dbCalls:   EMPTY_DB,
    slow:      false,
    tags,
    ...extra,
  } as LogEntry;
}

/** Ship a one-time startup event with runtime info. */
export function shipStartupEvent(shipper: RemoteShipper, tags: Record<string, string>): void {
  shipper.push(makeProcessEvent('startup', 0, tags, {
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

/** Start a repeating timer that ships memory + CPU snapshots. */
export function startProcessMetrics(
  shipper:    RemoteShipper,
  tags:       Record<string, string>,
  intervalMs: number,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    shipper.push(makeProcessEvent('metrics', 0, tags, {
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
export function captureUnhandledErrors(shipper: RemoteShipper, tags: Record<string, string>): void {
  process.on('uncaughtException', (err: Error) => {
    shipper.push(makeProcessEvent('uncaughtException', 500, tags, {
      errorName:    err.name,
      errorMessage: err.message,
      errorStack:   err.stack,
    }));
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : null;
    shipper.push(makeProcessEvent('unhandledRejection', 500, tags, {
      errorName:    err?.name    ?? 'UnhandledRejection',
      errorMessage: err?.message ?? String(reason),
      errorStack:   err?.stack,
    }));
  });
}
