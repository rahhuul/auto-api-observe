import { LogEntry, LoggerFn } from '../types';

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

/** Default console logger — prints coloured, pretty-printed JSON. */
export const defaultLogger: LoggerFn = (entry: LogEntry): void => {
  const color = statusColor(entry.status);
  const slowTag = entry.slow ? ` ${YELLOW}[SLOW]${RESET}` : '';
  const prefix = `${GRAY}[observe]${RESET} ${color}${entry.method} ${entry.route}${RESET}${slowTag}`;

  // Build a tidy output object in the documented shape
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

  // Merge custom fields
  const reserved = new Set([
    'timestamp', 'traceId', 'method', 'route', 'path',
    'status', 'latency', 'latencyMs', 'dbCalls', 'slow',
    'userAgent', 'ip',
  ]);
  for (const [k, v] of Object.entries(entry)) {
    if (!reserved.has(k) && v !== undefined) {
      output[k] = v;
    }
  }

  if (entry.ip) output['ip'] = entry.ip;
  if (entry.userAgent) output['userAgent'] = entry.userAgent;

  // Remove undefined keys
  const clean = Object.fromEntries(
    Object.entries(output).filter(([, v]) => v !== undefined)
  );

  console.log(`${prefix}\n${JSON.stringify(clean, null, 2)}`);
};
