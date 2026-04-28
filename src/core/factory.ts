import { ObservabilityOptions, LogEntry, LoggerFn, RequestContext } from '../types';
import { defaultLogger } from './logger';
import { recordMetric } from './metrics';
import { RemoteShipper } from './shipper';
import { autoInstrument } from './instrument';

export const DEFAULT_ENDPOINT = 'https://api.apilens.rest/v1/ingest';

export interface ResolvedOptions {
  slowThreshold: number;
  logger:        LoggerFn | false;
  enableMetrics: boolean;
  skipRoutes:    Array<string | RegExp>;
  traceHeader:   string;
  maxRoutes:     number;
  sampleRate:    number;
  onRequest?:    ObservabilityOptions['onRequest'];
  onResponse?:   ObservabilityOptions['onResponse'];
  shipper:       RemoteShipper;
}

export function warnNoApiKey(): void {
  console.warn(
    '\n[auto-api-observe] No API key — monitoring disabled.\n' +
    '  Sign up free at https://apilens.rest to get your key.\n' +
    '  Usage: observe({ apiKey: "ak_live_..." })\n',
  );
}

export function setup(options: ObservabilityOptions): ResolvedOptions | null {
  const {
    apiKey,
    endpoint      = DEFAULT_ENDPOINT,
    flushInterval = 5_000,
    flushSize     = 100,
    autoInstrument: shouldAutoInstrument = true,
    slowThreshold  = 1_000,
    logger         = defaultLogger,
    enableMetrics  = true,
    skipRoutes     = [],
    traceHeader    = 'x-trace-id',
    maxRoutes      = 1_000,
    sampleRate     = 1.0,
    onRequest,
    onResponse,
  } = options;

  if (!apiKey) {
    warnNoApiKey();
    return null;
  }

  if (shouldAutoInstrument) autoInstrument();

  return {
    slowThreshold,
    logger,
    enableMetrics,
    skipRoutes,
    traceHeader,
    maxRoutes,
    sampleRate,
    onRequest,
    onResponse,
    shipper: new RemoteShipper({ apiKey, endpoint, flushInterval, flushSize }),
  };
}

export function shouldSkip(path: string, skipRoutes: Array<string | RegExp>): boolean {
  return skipRoutes.some((p) =>
    typeof p === 'string' ? path.startsWith(p) : p.test(path),
  );
}

export function buildEntry(
  opts:      ResolvedOptions,
  context:   RequestContext,
  method:    string,
  route:     string,
  path:      string,
  status:    number,
  ip:        string,
  userAgent: string | undefined,
): LogEntry {
  const latency = Date.now() - context.startTime;
  return {
    timestamp:  new Date().toISOString(),
    traceId:    context.traceId,
    method,
    route,
    path,
    status,
    latency,
    latencyMs:  `${latency}ms`,
    dbCalls:    context.dbCallsDetail,
    slow:       latency > opts.slowThreshold,
    ip,
    userAgent,
    ...context.customFields,
  };
}

export function finalize(opts: ResolvedOptions, entry: LogEntry): void {
  if (opts.logger !== false && (opts.sampleRate >= 1.0 || Math.random() < opts.sampleRate)) {
    (opts.logger as LoggerFn)(entry);
  }
  if (opts.enableMetrics) recordMetric(entry, opts.maxRoutes);
  if (opts.onResponse)    opts.onResponse(entry);
  opts.shipper.push(entry);
}
