import { LogEntry, Metrics, RouteMetrics } from '../types';

const startedAt = new Date().toISOString();
const startTime = Date.now();

let totalRequests = 0;
let successRequests = 0;
let clientErrorRequests = 0;
let errorRequests = 0;
let slowRequests = 0;

const routeMap = new Map<string, {
  count: number;
  totalLatency: number;
  minLatency: number;
  maxLatency: number;
  errors: number;
  slowCount: number;
  statusCodes: Record<number, number>;
}>();

export function recordMetric(entry: LogEntry, maxRoutes = 1000): void {
  totalRequests++;

  if (entry.status >= 500) {
    errorRequests++;
  } else if (entry.status >= 400) {
    clientErrorRequests++;
  } else {
    successRequests++;
  }

  if (entry.slow) {
    slowRequests++;
  }

  const key = `${entry.method} ${entry.route}`;
  let route = routeMap.get(key);

  if (!route) {
    // Stop tracking new routes once the cap is reached — prevents unbounded
    // memory growth when bots or scanners hit many unique paths.
    if (routeMap.size >= maxRoutes) return;
    route = {
      count: 0,
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      errors: 0,
      slowCount: 0,
      statusCodes: {},
    };
    routeMap.set(key, route);
  }

  route.count++;
  route.totalLatency += entry.latency;
  route.minLatency = Math.min(route.minLatency, entry.latency);
  route.maxLatency = Math.max(route.maxLatency, entry.latency);
  if (entry.status >= 500) route.errors++;
  if (entry.slow) route.slowCount++;
  route.statusCodes[entry.status] = (route.statusCodes[entry.status] ?? 0) + 1;
}

export function getMetrics(): Metrics {
  const routes: Record<string, RouteMetrics> = {};

  for (const [key, r] of routeMap.entries()) {
    routes[key] = {
      count: r.count,
      avgLatency: Math.round(r.totalLatency / r.count),
      minLatency: r.minLatency === Infinity ? 0 : r.minLatency,
      maxLatency: r.maxLatency,
      errors: r.errors,
      slowCount: r.slowCount,
      statusCodes: { ...r.statusCodes },
    };
  }

  return {
    totalRequests,
    successRequests,
    clientErrorRequests,
    errorRequests,
    slowRequests,
    routes,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    startedAt,
  };
}

export function resetMetrics(): void {
  totalRequests = 0;
  successRequests = 0;
  clientErrorRequests = 0;
  errorRequests = 0;
  slowRequests = 0;
  routeMap.clear();
}
