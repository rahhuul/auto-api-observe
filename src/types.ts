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
   * Called at the start of every tracked request with the initial context.
   */
  onRequest?: (context: RequestContext) => void;

  /**
   * Called at the end of every tracked request with the final log entry.
   */
  onResponse?: (entry: LogEntry) => void;
}

export type LoggerFn = (entry: LogEntry) => void;

/** Live context stored per-request via AsyncLocalStorage. */
export interface RequestContext {
  traceId: string;
  startTime: number;
  dbCalls: number;
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
  dbCalls: number;
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
