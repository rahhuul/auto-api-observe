export interface ObservabilityOptions {
  /** Latency threshold (ms) above which a request is flagged as slow. @default 1000 */
  slowThreshold?: number;

  /** Custom logger function. Set `false` to silence console output entirely. */
  logger?: LoggerFn | false;

  /** Collect in-memory metrics accessible via `getMetrics()`. @default true */
  enableMetrics?: boolean;

  /** Routes to skip entirely (string prefix or regex). */
  skipRoutes?: Array<string | RegExp>;

  /** Header used to propagate trace IDs. @default 'x-trace-id' */
  traceHeader?: string;

  /** Max distinct routes tracked in memory. Prevents unbounded growth. @default 1000 */
  maxRoutes?: number;

  /**
   * Fraction of requests to log (0.0–1.0). Metrics are always recorded.
   * @default 1.0
   */
  sampleRate?: number;

  /** Called at the start of every tracked request. */
  onRequest?: (context: RequestContext) => void;

  /** Called at the end of every tracked request with the final log entry. */
  onResponse?: (entry: LogEntry) => void;

  /**
   * Auto-patch installed DB libraries (pg, mysql2, mongoose, prisma, knex,
   * sequelize, ioredis, better-sqlite3, node-redis).
   * @default true
   */
  autoInstrument?: boolean;

  /**
   * Auto-patch outbound HTTP clients (axios, native fetch, undici).
   * Tracks method, masked URL, status, and latency of every outbound call.
   * @default true
   */
  autoInstrumentOutbound?: boolean;

  // ─── Remote shipping ─────────────────────────────────────────────────────────

  /** Your APILens project API key. Required — monitoring is disabled without it. */
  apiKey?: string;

  /** Ingest endpoint URL. @default 'https://api.apilens.rest/v1/ingest' */
  endpoint?: string;

  /** Flush interval in ms. @default 5000 */
  flushInterval?: number;

  /** Flush when queue reaches this size. @default 100 */
  flushSize?: number;

  // ─── Enrichment ──────────────────────────────────────────────────────────────

  /**
   * Static key/value tags attached to every event (e.g. service name, version, env).
   * @example { service: 'user-api', version: '2.1.0', env: 'production' }
   */
  tags?: Record<string, string>;

  /**
   * Ship memory + CPU metrics every N milliseconds as background events.
   * Set `false` to disable.
   * @default 30000
   */
  processMetrics?: number | false;

  /**
   * Capture `uncaughtException` and `unhandledRejection` and ship them as error
   * events. Opt-in because adding an uncaughtException listener changes Node.js
   * process-exit behaviour.
   * @default false
   */
  captureUnhandledErrors?: boolean;
}

export type LoggerFn = (entry: LogEntry) => void;

/** A single tracked database query. */
export interface DbQuery {
  query:         string;
  source:        string;
  executionTime: string;
  queryTime:     number;
}

/** Aggregated DB call info attached to each log entry. */
export interface DbCalls {
  calls:        number;
  totalTime:    number;
  slowestQuery: number;
  queries:      DbQuery[];
}

/** A single tracked outbound HTTP call. */
export interface OutboundCall {
  method:  string;
  /** URL with sensitive query-params redacted. */
  url:     string;
  status:  number;
  latency: number;
}

/** Live context stored per-request via AsyncLocalStorage. */
export interface RequestContext {
  traceId:        string;
  startTime:      number;
  /** @deprecated Use dbCallsDetail. Kept for backward compat. */
  dbCalls:        number;
  dbCallsDetail:  DbCalls;
  customFields:   Record<string, unknown>;
  /** Populated by outbound HTTP auto-instrumentation. */
  outboundCalls?: OutboundCall[];
}

/** The structured log entry emitted after each response. */
export interface LogEntry {
  timestamp:      string;
  traceId:        string;
  method:         string;
  /** Matched route pattern, e.g. `/users/:id` */
  route:          string;
  /** Raw request path, e.g. `/users/42` */
  path:           string;
  status:         number;
  latency:        number;
  latencyMs:      string;
  dbCalls:        DbCalls;
  slow:           boolean;
  userAgent?:     string;
  ip?:            string;
  requestSize?:   number;
  responseSize?:  number;
  outboundCalls?: OutboundCall[];
  tags?:          Record<string, string>;
  /** Any extra fields added via `addField()` */
  [key: string]: unknown;
}

/** Aggregated metrics returned by `getMetrics()`. */
export interface Metrics {
  totalRequests:        number;
  successRequests:      number;
  clientErrorRequests:  number;
  errorRequests:        number;
  slowRequests:         number;
  routes:               Record<string, RouteMetrics>;
  uptime:               number;
  startedAt:            string;
}

export interface RouteMetrics {
  count:        number;
  avgLatency:   number;
  minLatency:   number;
  maxLatency:   number;
  errors:       number;
  slowCount:    number;
  statusCodes:  Record<number, number>;
}
