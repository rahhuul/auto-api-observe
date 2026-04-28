# Changelog

All notable changes to `auto-api-observe` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.3.0] — 2026-04-28

### Added
- **12 framework adapters** — Koa, Hono, NestJS (interceptor), Next.js API routes, Hapi, Elysia (Bun), Apollo Server, AWS Lambda, tRPC, and Restify added alongside existing Express and Fastify
- **Outbound HTTP tracking** — every `fetch`, `axios`, and `undici` call your server makes is captured per-request; sensitive query params (`token`, `api_key`, `secret`, `password`…) are redacted from outbound URLs before logging
- **Process monitoring** — startup event (Node version, hostname, pid, CPU count), recurring memory/CPU metrics (`rss`, `heapUsed`, load average) every 30 s via `processMetrics` option, and optional `uncaughtException`/`unhandledRejection` capture via `captureUnhandledErrors`
- **Sensitive field masking** — `addField()` keys matching `authorization`, `password`, `token`, `api_key`, `cookie`, `secret`, `credit_card`, `ssn`, `private_key`, and 15 more patterns are replaced with `[REDACTED]` before shipping; case-insensitive
- **Global tags** — `tags: { service, version, env }` option attaches static key/value pairs to every event
- **node-redis v4 auto-instrumentation** — brings auto-patched DB libraries to 9 total
- **`requestSize` / `responseSize`** fields on `LogEntry` read from `Content-Length` headers (no body buffering)
- **`outboundCalls` array** on `LogEntry` and `RequestContext`
- **Shared `factory.ts`** — eliminates duplication across all 12 adapter files; all adapters use the same `setup()`, `buildEntry()`, `finalize()` pipeline
- **GitHub Actions CI** — matrix testing on Node 18, 20, and 22; `npm publish --dry-run` gate on every push to master
- **107 tests** — 63 new tests covering all v1.3.0 features (unit + integration)

### Changed
- `apiKey` is now required — omitting it prints a one-time signup prompt and returns a no-op middleware so the app boots normally with nothing tracked

### Fixed
- `skip-override` set correctly on all Fastify hooks

---

## [1.2.0] — 2026-03-20

### Added
- **Cloud shipping** — `apiKey` option ships batched `LogEntry` events to `https://api.apilens.rest/v1/ingest` via the `RemoteShipper`
- **Auto DB instrumentation** — zero-config monkey-patching of 8 libraries at startup: `pg`, `mysql2`, `mongoose`, `@prisma/client`, `knex`, `sequelize`, `ioredis`, `better-sqlite3`
- **Per-query detail** — each captured DB call records masked query string, source library name, execution timestamp, and duration in ms
- **N+1 visibility** — `dbCalls` on `LogEntry` upgraded to an object with `calls`, `totalTime`, `slowestQuery`, and a `queries` array
- **`recordDbQuery()`** — manual instrumentation helper for any DB library not in the auto-patched list
- **`addField()`** — attaches arbitrary key/value context to the current request via `AsyncLocalStorage`; scoped per-request, safe under concurrent load
- **`getContext()`** — returns the live `RequestContext` from anywhere in the call stack during a request
- **44 tests** — unit + integration coverage across Express and Fastify

### Changed
- `dbCalls` on `LogEntry` changed from `number` to a `DbCalls` object — use `.dbCalls.calls` where you previously read `.dbCalls` as a number

---

## [1.1.0] — 2026-03-07

### Added
- **`RemoteShipper`** — buffers `LogEntry` objects in memory and POSTs them to the APILens ingest endpoint in batches; configurable `flushInterval` (default 5 000 ms) and `flushSize` (default 100)
- **`sampleRate`** option (0.0–1.0) — logs only a fraction of requests at high volume; in-memory metrics are always recorded regardless of sample rate
- **`maxRoutes`** cap — prevents unbounded memory growth when APIs have many dynamic segments (default 1 000)
- **`clientErrorRequests`** counter in `Metrics` — 4xx errors now tracked separately from 5xx

### Changed
- Logger rewritten with buffered stdout writes (50 ms flush interval) — sustained throughput exceeds **100k requests/minute**
- Fastify adapter fully rewritten for Fastify v5: async hooks, `enterWith`, correct `skip-override`
- `RESERVED_KEYS` set hoisted to module scope for O(1) lookup on every request

### Fixed
- 4xx responses were incorrectly counted as `successRequests` — now correctly counted under `clientErrorRequests`

---

## [1.0.0] — 2026-02-01

### Added
- **Express middleware** — `app.use(observe({ apiKey }))` auto-instruments all routes
- **Fastify plugin** — `fastifyObservability` registers as a native Fastify plugin via `addHook`
- **Request tracing** — every request logs method, normalised route pattern (e.g. `/users/:id`), raw path, HTTP status, latency, trace ID, IP, and User-Agent
- **Distributed trace IDs** — UUID generated per request, injected into the `x-trace-id` response header for cross-service correlation
- **Slow request detection** — configurable `slowThreshold` (default 1 000 ms); requests that breach it are flagged `slow: true`
- **In-memory metrics** — `getMetrics()` returns per-route aggregates: count, avg/min/max latency, p95 latency, error count, slow count, per-status-code breakdown
- **`skipRoutes`** — array of string prefixes or regexes to exclude from tracking (health checks, internal probes)
- **`onRequest` / `onResponse` callbacks** — hook into the request lifecycle without modifying any route handler
- **Zero production dependencies**
- **Full TypeScript types** — all interfaces exported from the package root (`ObservabilityOptions`, `LogEntry`, `Metrics`, `RequestContext`, etc.)
