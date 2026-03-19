import { LogEntry, LoggerFn, DbCalls } from '../types';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function statusColor(status: number): string {
  if (status < 300) return GREEN;
  if (status < 400) return CYAN;
  if (status < 500) return YELLOW;
  return RED;
}

// Hoisted once at module load — avoids allocating a new Set on every request.
const RESERVED_KEYS = new Set([
  'timestamp', 'traceId', 'method', 'route', 'path',
  'status', 'latency', 'latencyMs', 'dbCalls', 'slow',
  'userAgent', 'ip',
]);

// ─── Buffered output ──────────────────────────────────────────────────────────
// Instead of one synchronous console.log per request (which blocks the event
// loop at high throughput), we accumulate log lines in a string buffer and
// flush to stdout every 50 ms. Under load this batches hundreds of writes into
// a single process.stdout.write() call, dramatically reducing I/O overhead.
// The interval is unref'd so it never prevents the process from exiting.
let _buf = '';

function _flush(): void {
  if (_buf.length === 0) return;
  process.stdout.write(_buf);
  _buf = '';
}

setInterval(_flush, 50).unref();

// Force-flush any remaining buffer when the process is about to exit so no
// log lines are lost on graceful shutdown.
process.on('exit', _flush);

/** Default console logger — prints coloured prefix + compact JSON. */
export const defaultLogger: LoggerFn = (entry: LogEntry): void => {
  const color = statusColor(entry.status);
  const slowTag = entry.slow ? ` ${YELLOW}[SLOW]${RESET}` : '';
  const prefix = `${GRAY}[observe]${RESET} ${color}${entry.method} ${entry.route}${RESET}${slowTag}`;

  const output: Record<string, unknown> = {
    timestamp: entry.timestamp,
    traceId: entry.traceId,
    method: entry.method,
    route: entry.route,
    path: entry.path !== entry.route ? entry.path : undefined,
    status: entry.status,
    latencyMs: entry.latencyMs,
    dbCalls: entry.dbCalls,
    slow: entry.slow || undefined,
  };

  // Merge custom fields added via addField()
  for (const [k, v] of Object.entries(entry)) {
    if (!RESERVED_KEYS.has(k) && v !== undefined) {
      output[k] = v;
    }
  }

  if (entry.ip) output['ip'] = entry.ip;
  if (entry.userAgent) output['userAgent'] = entry.userAgent;

  // Strip undefined keys then serialise as compact JSON (no indentation —
  // significantly faster than JSON.stringify(x, null, 2) at high volume).
  const clean = Object.fromEntries(
    Object.entries(output).filter(([, v]) => v !== undefined)
  );

  // Append to buffer — flushed every 50 ms by the interval above.
  _buf += `${prefix}\n${JSON.stringify(clean)}\n`;

  // Safety valve: if the buffer somehow exceeds 256 KB between flushes
  // (e.g., extremely large custom fields), flush immediately.
  if (_buf.length > 262144) _flush();
};
