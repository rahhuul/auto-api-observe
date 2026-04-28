import { ObservabilityOptions, LogEntry, LoggerFn, RequestContext } from '../types';
import { defaultLogger } from './logger';
import { recordMetric } from './metrics';
import { RemoteShipper } from './shipper';
import { autoInstrument } from './instrument';
import { shipStartupEvent, startProcessMetrics, captureUnhandledErrors } from './process-monitor';

export const DEFAULT_ENDPOINT = 'https://api.apilens.rest/v1/ingest';

export interface ResolvedOptions {
  slowThreshold: number;
  logger:        LoggerFn | false;
  enableMetrics: boolean;
  skipRoutes:    Array<string | RegExp>;
  traceHeader:   string;
  maxRoutes:     number;
  sampleRate:    number;
  tags:          Record<string, string>;
  onRequest?:    ObservabilityOptions['onRequest'];
  onResponse?:   ObservabilityOptions['onResponse'];
  shipper:       RemoteShipper;
}

// Keys automatically redacted from customFields before shipping
const SENSITIVE_KEYS = new Set([
  'authorization', 'auth', 'password', 'passwd', 'pwd', 'secret',
  'token', 'access_token', 'refresh_token', 'id_token',
  'api_key', 'apikey', 'x-api-key', 'cookie', 'set-cookie',
  'credit_card', 'card_number', 'cvv', 'ssn', 'private_key',
]);

function maskCustomFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
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
    autoInstrument:          shouldAutoInstrument = true,
    autoInstrumentOutbound:  shouldInstrumentOutbound = true,
    slowThreshold  = 1_000,
    logger         = defaultLogger,
    enableMetrics  = true,
    skipRoutes     = [],
    traceHeader    = 'x-trace-id',
    maxRoutes      = 1_000,
    sampleRate     = 1.0,
    tags           = {},
    processMetrics = 30_000,
    captureUnhandledErrors: shouldCaptureErrors = false,
    onRequest,
    onResponse,
  } = options;

  if (!apiKey) {
    warnNoApiKey();
    return null;
  }

  if (shouldAutoInstrument) autoInstrument(shouldInstrumentOutbound);

  const shipper = new RemoteShipper({ apiKey, endpoint, flushInterval, flushSize });

  // One-time startup event
  shipStartupEvent(shipper, tags);

  // Background process metrics
  if (processMetrics !== false && processMetrics > 0) {
    startProcessMetrics(shipper, tags, processMetrics);
  }

  // Opt-in error capture
  if (shouldCaptureErrors) {
    captureUnhandledErrors(shipper, tags);
  }

  return {
    slowThreshold,
    logger,
    enableMetrics,
    skipRoutes,
    traceHeader,
    maxRoutes,
    sampleRate,
    tags,
    onRequest,
    onResponse,
    shipper,
  };
}

export function shouldSkip(path: string, skipRoutes: Array<string | RegExp>): boolean {
  return skipRoutes.some((p) =>
    typeof p === 'string' ? path.startsWith(p) : p.test(path),
  );
}

export function buildEntry(
  opts:         ResolvedOptions,
  context:      RequestContext,
  method:       string,
  route:        string,
  path:         string,
  status:       number,
  ip:           string,
  userAgent:    string | undefined,
  extras?:      { requestSize?: number; responseSize?: number },
): LogEntry {
  const latency = Date.now() - context.startTime;
  return {
    timestamp:     new Date().toISOString(),
    traceId:       context.traceId,
    method,
    route,
    path,
    status,
    latency,
    latencyMs:     `${latency}ms`,
    dbCalls:       context.dbCallsDetail,
    slow:          latency > opts.slowThreshold,
    ip,
    userAgent,
    requestSize:   extras?.requestSize,
    responseSize:  extras?.responseSize,
    outboundCalls: context.outboundCalls?.length ? context.outboundCalls : undefined,
    tags:          Object.keys(opts.tags).length ? opts.tags : undefined,
    ...maskCustomFields(context.customFields),
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
