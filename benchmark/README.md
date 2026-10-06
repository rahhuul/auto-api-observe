# Middleware overhead benchmark

A controlled, reproducible benchmark measuring the actual latency `auto-api-observe` adds
to a request — built because the site previously stated "under 0.3ms" and "less than 1ms per
request" without any real measurement behind either number. This replaces both with real data.

## Methodology

Two identical single-route Express apps (`GET /ping` → `res.json({ ok, ts })`), differing in
exactly one thing: whether `observe()` is installed.

- `baseline-server.js` — plain Express, no instrumentation.
- `observed-server.js` — same app, wrapped with `app.use(observe({ ... }))`, pointed at a
  local mock ingest sink (`mock-ingest.js`) instead of the real `api.apilens.rest`, so the
  benchmark measures the middleware's own CPU/instrumentation cost — not network latency to a
  remote server, and without spending real ingest quota. This is a fair isolation, not a
  shortcut: `RemoteShipper.push()` is synchronous and non-blocking in the request path either
  way (see `src/core/shipper.ts`) — actual network shipping always happens off-cycle on a
  timer/batch-size trigger, regardless of what `endpoint` points to.

Load generated with [`autocannon`](https://github.com/mcollina/autocannon), 50 concurrent
connections, 10,000 requests per run, against `localhost` (no real network hop). Each server
was warmed up with a 2,000-request run before the 3 measured runs reported below.

## Run it yourself

```bash
npm run build          # compile src/ -> dist/, benchmark requires the built package
node benchmark/mock-ingest.js &
node benchmark/baseline-server.js &
node benchmark/observed-server.js &
npx autocannon -c 50 -a 10000 http://localhost:4000/ping   # baseline
npx autocannon -c 50 -a 10000 http://localhost:4001/ping   # observed
```

## Results (2026-10-06, v1.5.0, Node v24.13.0, Windows)

3 runs each, 10,000 requests/run, 50 concurrent connections, ~10,000 req/sec sustained
throughput in both cases (the middleware didn't reduce throughput at this concurrency — it
added latency per request, not a ceiling):

| | Baseline | With auto-api-observe |
|---|---|---|
| Avg latency (3 runs) | 1.78ms / 1.15ms / 1.23ms | 2.80ms / 2.70ms / 2.12ms |
| p50 | ~1–2ms | ~2ms |
| p97.5 | ~2–4ms | ~5–8ms |
| p99 | ~3–4ms | ~6–11ms |

**Delta: approximately +1.1–1.5ms average overhead per request**, under this synthetic
load (trivial route, no real DB/outbound work — real routes doing actual work would see a
*smaller proportional* overhead, since the fixed instrumentation cost gets amortized over a
larger total request time).

This number is higher than what the site previously claimed ("under 0.3ms"), not lower — it's
reported here anyway because an honest number beats a flattering one that isn't backed by
anything.

## What this does NOT measure yet

- DB query instrumentation overhead specifically (the `/ping` route touches no database).
  The site's old "under 50 nanoseconds per DB call" claim is unverified by this benchmark and
  should not be repeated until it has its own real test.
- Outbound HTTP call instrumentation overhead (`autoInstrumentOutbound`).
- Behavior under sustained high-cardinality route/trace volume over a long-running process
  (this benchmark is a single short burst).
