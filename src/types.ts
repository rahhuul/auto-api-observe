export interface ObservabilityOptions {
  /**
   * Latency threshold in milliseconds above which a request is flagged as slow.
   * @default 1000
   */
  slowThreshold?: number;

  /**
   * Custom logger function. Receives a structured LogEntry on every response.
   * Set to `false` to disable console output entirely.
   * @default console.log (JSON format)
   */
  logger?: LoggerFn | false;

  /**
   * Whether to collect in-memory metrics accessible via `getMetrics()`.
   * @default true
   */
  enableMetrics?: boolean;

  /**
   * Routes to skip entirely (string prefix or regex).
   * @example ['/health', '/ready', /^\/internal/]
   */
  skipRoutes?: Array<string | RegExp>;

  /**
   * Header name used to propagate / receive trace IDs.
   * @default 'x-trace-id'
   */
  traceHeader?: string;

  /**
   * Maximum number of distinct routes tracked in the in-memory metrics map.
   * Once the limit is reached, new unseen routes are silently ignored.
   * Prevents unbounded memory growth when many unique paths hit the server
   * (e.g. bots scanning `/users/1`, `/users/2` … as separate routes).
   * @default 1000
   */
  maxRoutes?: number;

  /**
   * Fraction of requests to log — between 0.0 (log nothing) and 1.0 (log
   * all, the default). Useful at very high throughput where logging every
   * request is too expensive. Metrics are always recorded regardless of this
   * value so counts stay accurate.
   * @default 1.0
   * @example 0.1  // log only ~10 % of requests
   */
  sampleRate?: number;

  /**
   * Called at the start of every tracked request with the initial context.
   */
  onRequest?: (context: RequestContext) => void;

  /**
   * Called at the end of every tracked request with the final log entry.
   */
  onResponse?: (entry: LogEntry) => void;

  // ─── Auto-instrumentation ──────────────────────────────────────────────────

  /**
   * Automatically patch installed database libraries (pg, mysql2, mongoose,
   * prisma, knex, sequelize, ioredis, better-sqlite3) so `dbCalls` is
   * counted without manual `trackDbCall()` calls.
   *
   * - `true`  — auto-detect and patch all found libraries (recommended)
   * - `false` — disable auto-instrumentation, use manual `trackDbCall()` only
   *
   * @default true
   */
  autoInstrument?: boolean;

  // ─── Remote shipping (ObserveAPI SaaS) ─────────────────────────────────────

  /**
   * Your ObserveAPI project API key (`sk_live_...`).
   * When set, every LogEntry is batched and shipped to the ingest endpoint.
   * Local logging still works alongside remote shipping.
   */
  apiKey?: string;

  /**
   * ObserveAPI ingest endpoint URL.
   * @default 'https://api.apilens.rest/v1/ingest'
   */
  endpoint?: string;

  /**
   * How often (ms) to flush the event batch to the remote endpoint.
   * @default 5000
   */
  flushInterval?: number;

  /**
   * Flush immediately when this many events are queued, regardless of interval.
   * @default 100
   */
  flushSize?: number;
}

export type LoggerFn = (entry: LogEntry) => void;

/** A single tracked database query. */
export interface DbQuery {
  /** The query string (parameterised / masked — no raw values). */
  query: string;
  /** Which DB library executed this query. */
  source: string;
  /** ISO-8601 timestamp when the query started. */
  executionTime: string;
  /** Query duration in milliseconds. */
  queryTime: number;
}

/** Aggregated DB call info attached to each log entry. */
export interface DbCalls {
  /** Total number of DB calls in this request. */
  calls: number;
  /** Sum of all query durations in milliseconds. */
  totalTime: number;
  /** The slowest single query time in milliseconds. */
  slowestQuery: number;
  /** Individual query details. */
  queries: DbQuery[];
}

/** Live context stored per-request via AsyncLocalStorage. */
export interface RequestContext {
  traceId: string;
  startTime: number;
  /** @deprecated Use dbCallsDetail instead. Kept for backward compat. */
  dbCalls: number;
  dbCallsDetail: DbCalls;
  customFields: Record<string, unknown>;
}

/** The structured log entry emitted after each response. */
export interface LogEntry {
  timestamp: string;
  traceId: string;
  method: string;
  /** Matched Express/Fastify route pattern, e.g. `/users/:id` */
  route: string;
  /** Raw request path, e.g. `/users/42` */
  path: string;
  status: number;
  /** Latency in milliseconds (number) */
  latency: number;
  /** Human-readable latency string, e.g. `"120ms"` */
  latencyMs: string;
  /** Rich DB call profiling with per-query details. */
  dbCalls: DbCalls;
  slow: boolean;
  userAgent?: string;
  ip?: string;
  /** Any extra fields added via `addField()` */
  [key: string]: unknown;
}

/** Aggregated metrics returned by `getMetrics()`. */
export interface Metrics {
  totalRequests: number;
  /** Requests with HTTP status < 400 (2xx / 3xx). */
  successRequests: number;
  /** Requests with HTTP status 400–499 (client errors: 404, 401, …). */
  clientErrorRequests: number;
  /** Requests with HTTP status >= 500 (server errors). */
  errorRequests: number;
  slowRequests: number;
  routes: Record<string, RouteMetrics>;
  uptime: number;
  startedAt: string;
}

export interface RouteMetrics {
  count: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  errors: number;
  slowCount: number;
  statusCodes: Record<number, number>;
}
