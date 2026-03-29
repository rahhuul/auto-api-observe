# Changelog

All notable changes to `auto-api-observe` will be documented in this file.

## [1.2.0] - 2026-03-15

### Added
- Cloud dashboard integration — ship logs to [apilens.rest](https://apilens.rest) with `apiKey` option
- Auto DB instrumentation for 8 libraries: `pg`, `mysql2`, `mongoose`, `@prisma/client`, `knex`, `sequelize`, `ioredis`, `better-sqlite3`
- Per-query timing and masked SQL in dashboard
- N+1 query detection (flags routes with high DB calls per request)
- RemoteShipper with batched flush (configurable `flushInterval` and `flushSize`)
- 44 tests (unit + integration) with full coverage

### Changed
- Default logger now includes `dbCalls` detail object with query breakdown
- Trace ID propagated via `x-trace-id` response header

## [1.1.0] - 2026-03-01

### Added
- Buffered async logger for high-throughput APIs (100k+ req/min)
- `sampleRate` option — log a percentage of requests at high volume
- `maxRoutes` cap (default 1000) to prevent unbounded memory growth
- Memory-safe metrics aggregation

### Changed
- Logger writes are non-blocking by default
- Improved Fastify v5 compatibility

## [1.0.0] - 2026-02-15

### Added
- Express middleware (`observe()`)
- Fastify plugin (`observe()`)
- Structured JSON request logs (method, route, status, latency, IP, user agent)
- Distributed trace IDs (auto-generated UUID, propagated via `x-trace-id`)
- Slow request detection (configurable threshold, default 1000ms)
- In-memory metrics aggregation (`getMetrics()`)
- Custom fields API (`addField()`)
- P95 latency tracking per route
- Error rate tracking
- TypeScript-first with full type definitions
- Zero runtime dependencies
