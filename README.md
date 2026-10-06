<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/logo-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/logo-light.png" />
    <img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/logo-light.png" alt="APILens" width="420" />
  </picture>
</p>

<h1 align="center">auto-api-observe</h1>

<p align="center">
  <strong>Drop-in API observability for Node.js — without agents, sidecars, or config files.</strong><br/>
  Request tracing · DB profiling · Outbound HTTP · Distributed traces · Process metrics · Cloud dashboard
</p>

<p align="center">
  <a href="https://apilens.rest">APILens</a> ·
  <a href="https://apilens.rest/features">Docs</a> ·
  <a href="https://www.npmjs.com/package/auto-api-observe">npm</a> ·
  <a href="https://github.com/rahhuul/auto-api-observe/blob/master/CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/auto-api-observe"><img src="https://img.shields.io/npm/v/auto-api-observe?style=flat-square&color=10b981" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/auto-api-observe"><img src="https://img.shields.io/npm/dm/auto-api-observe?style=flat-square&color=10b981" alt="npm downloads" /></a>
  <a href="https://github.com/rahhuul/auto-api-observe/actions"><img src="https://img.shields.io/github/actions/workflow/status/rahhuul/auto-api-observe/ci.yml?branch=master&style=flat-square&label=CI&color=10b981" alt="CI" /></a>
  <a href="https://github.com/rahhuul/auto-api-observe"><img src="https://img.shields.io/github/stars/rahhuul/auto-api-observe?style=flat-square&color=10b981" alt="GitHub stars" /></a>
  <a href="https://github.com/rahhuul/auto-api-observe/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981?style=flat-square" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-10b981?style=flat-square" alt="Node.js 18+" /></a>
</p>

---

## Why this exists

You shipped a Node.js API. Then something gets slow.

You need to know:

- Which route is slow, and is it your code or the database?
- Which query is causing the latency — and is it an N+1?
- How many requests are failing, and where?
- Which third-party API is adding latency to your response time?
- Can you follow one request across services?

Datadog wants $23/host/month and an afternoon of agent config. `auto-api-observe` answers those questions with one line and no agent:

```js
app.use(observe({ apiKey: process.env.APILENS_KEY }));
```

Request telemetry, database profiling, outbound HTTP tracking, distributed trace IDs, process metrics, and sensitive-field masking — shipped to a free cloud dashboard at [apilens.rest](https://apilens.rest).

<p align="center">
  <img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/apilens-demo.gif" alt="APILens dashboard demo — landing page and a tour of the live dashboard" width="100%" />
</p>

---

## What you get

| Capability | What it gives you |
|---|---|
| 🔭 Request tracking | Method, route, status, latency, IP, User-Agent, request/response size |
| 🚨 Error tracking | 4xx/5xx visibility, error timelines, top error routes |
| 🐌 Slow requests | Configurable threshold + route-level P95 latency |
| 🗄️ Database profiling | Auto-instrumentation across 9 DB libraries |
| 🔁 N+1 detection | Flags routes with a high average query count per request |
| 🌐 Outbound HTTP | Tracks `fetch`, Axios, and Undici calls automatically |
| 🧵 Distributed tracing | Propagates `x-trace-id` across services |
| 📊 Process metrics | Memory, CPU, load average — plus auto-tagged hostname/pid |
| 🛡️ Sensitive-field masking | Redacts common secrets before anything ships |
| 🏷️ Global tags | Attach service, environment, region, version, etc. |
| 📡 Live Tail | Real-time request stream in the dashboard |
| 🌍 Geographic insights | Traffic by country/city, unique IPs, bot detection |
| 🔔 Alerts | Email or Slack when error rate or latency spikes |
| ☁️ Cloud dashboard | Requests, routes, errors, DB, traces, usage, geography |

---

## Quick Start

**1. Install**

```bash
npm install auto-api-observe
```

**2. Get a free API key** at [apilens.rest](https://apilens.rest) — no credit card required.

**3. Add one line**

```js
const express = require('express');
const observe = require('auto-api-observe');

const app = express();
app.use(observe({ apiKey: process.env.APILENS_KEY }));

app.get('/users', (req, res) => res.json({ users: [] }));
app.listen(3000);
```

Open the dashboard — your API is already there.

---

## Framework Support

| Framework | Import | Style |
|---|---|---|
| **Express** ≥4 | `require('auto-api-observe')` | `app.use(observe(...))` |
| **Fastify** ≥4 | `{ fastifyObservability }` | `fastify.register(...)` |
| **Koa** ≥2 | `{ koaObservability }` | `app.use(...)` |
| **Hono** ≥3 | `{ honoObservability }` | `app.use(...)` |
| **NestJS** ≥9 | `{ createNestObservabilityInterceptor }` | Global interceptor |
| **Next.js** ≥13 (Pages Router) | `{ withNextObservability }` | API route wrapper |
| **Next.js** ≥13 (App Router) | `{ withAppRouterObservability }` | Route handler wrapper |
| **Hapi** ≥20 | `{ hapiObservabilityPlugin }` | `server.register(...)` |
| **Elysia** ≥0.7 | `{ elysiaObservability }` | Plugin |
| **Apollo Server** ≥4 | `{ apolloObservabilityPlugin }` | Plugin |
| **AWS Lambda** | `{ withLambdaObservability }` | Handler wrapper |
| **tRPC** ≥7 | `{ createTrpcObservabilityMiddleware }` | `t.middleware()` |
| **Restify** | `{ createRestifyMiddleware }` | `server.use(...)` |

<details>
<summary><strong>Show setup code for every framework</strong></summary>

### Fastify

```js
const fastify = require('fastify')();
const { fastifyObservability } = require('auto-api-observe');

await fastify.register(fastifyObservability, { apiKey: process.env.APILENS_KEY });

fastify.get('/users', async () => ({ users: [] }));
await fastify.listen({ port: 3000 });
```

### Koa

```js
const Koa = require('koa');
const { koaObservability } = require('auto-api-observe');

const app = new Koa();
app.use(koaObservability({ apiKey: process.env.APILENS_KEY }));
```

### Hono

```js
import { Hono } from 'hono';
import { honoObservability } from 'auto-api-observe';

const app = new Hono();
app.use('*', honoObservability({ apiKey: process.env.APILENS_KEY }));
```

### NestJS

```ts
// main.ts
import { createNestObservabilityInterceptor } from 'auto-api-observe';

const Interceptor = createNestObservabilityInterceptor({ apiKey: process.env.APILENS_KEY });
app.useGlobalInterceptors(new Interceptor());
```

### Next.js — Pages Router

```ts
// pages/api/users.ts
import { withNextObservability } from 'auto-api-observe';
import type { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json({ users: [] });
}

export default withNextObservability(handler, { apiKey: process.env.APILENS_KEY });
```

### Next.js — App Router

```ts
// app/api/users/route.ts
import { withAppRouterObservability } from 'auto-api-observe';

export const GET = withAppRouterObservability(async (request) => {
  return Response.json({ users: [] });
}, { apiKey: process.env.APILENS_KEY });
```

### Hapi

```js
const { hapiObservabilityPlugin } = require('auto-api-observe');

await server.register({ plugin: hapiObservabilityPlugin, options: { apiKey: process.env.APILENS_KEY } });
```

### AWS Lambda

```js
const { withLambdaObservability } = require('auto-api-observe');

const handler = async (event) => ({ statusCode: 200, body: 'ok' });
module.exports.handler = withLambdaObservability(handler, { apiKey: process.env.APILENS_KEY });
```

### tRPC

```ts
import { createTrpcObservabilityMiddleware } from 'auto-api-observe';

const observability = createTrpcObservabilityMiddleware({ apiKey: process.env.APILENS_KEY });

export const observedProcedure = t.procedure.use(observability);
```

</details>

---

## What's Logged

Every request emits a structured JSON entry:

```json
{
  "timestamp": "2026-09-13T12:00:00.000Z",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "route": "/api/users/:id",
  "path": "/api/users/42",
  "status": 200,
  "latency": 85,
  "slow": false,
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "requestSize": 512,
  "responseSize": 1024,
  "tags": { "service": "user-api", "env": "production" },
  "dbCalls": {
    "calls": 2,
    "totalTime": 45,
    "slowestQuery": 30,
    "queries": [
      { "query": "SELECT * FROM users WHERE id = ?", "source": "pg", "queryTime": 30 },
      { "query": "SELECT COUNT(*) FROM sessions WHERE user_id = ?", "source": "pg", "queryTime": 15 }
    ]
  },
  "outboundCalls": [
    { "method": "POST", "url": "https://api.stripe.com/v1/charges", "status": 200, "latency": 340 }
  ]
}
```

---

## Auto DB Instrumentation

No code changes to your queries. The middleware patches these libraries at startup:

| Library | What's tracked |
|---|---|
| **pg** (node-postgres) | SQL query, masked params, execution time |
| **mysql2** | Same |
| **mongoose** | Operation, collection, execution time |
| **@prisma/client** | Model, action, execution time |
| **knex** | SQL query, execution time |
| **sequelize** | SQL query, execution time |
| **ioredis** | Command, execution time |
| **better-sqlite3** | SQL query, execution time |
| **node-redis** | Command, execution time |
| **Drizzle ORM** | SQL query, execution time — via `drizzle-orm/node-postgres`, `drizzle-orm/mysql2`, or `drizzle-orm/better-sqlite3` (not yet `drizzle-orm/postgres-js`) |

For each query: masked SQL (values replaced with `?`), execution time, source library, and per-request aggregates.

```js
app.get('/orders', async (req, res) => {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = $1', [req.user.id]);
  res.json(orders);
  // log shows: dbCalls: { calls: 1, totalTime: 12, queries: [...] }
});
```

### N+1 detection

The dashboard flags routes with an unusually high average query count per request — the signature of an N+1:

```text
GET /api/orders/:id/items

avg calls/req: 21    ← one route firing 21 queries per request is your N+1
```

<p align="center">
  <img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/screenshots/database.png" alt="Database Performance — N+1 Query Detector and source distribution" width="100%" />
</p>

---

## Outbound HTTP Tracking

Automatically tracks outbound HTTP calls your server makes — `fetch`, Axios, and Undici:

```js
observe({
  apiKey: process.env.APILENS_KEY,
  autoInstrumentOutbound: true, // default: true
});
```

```json
"outboundCalls": [
  { "method": "GET",  "url": "https://api.github.com/user", "status": 200, "latency": 120 },
  { "method": "POST", "url": "https://api.stripe.com/v1/charges", "status": 201, "latency": 340 }
]
```

Sensitive query parameters (`token`, `api_key`, `password`, `secret`, etc.) are stripped from URLs automatically.

---

## Distributed Tracing

Trace IDs propagate across services via the `x-trace-id` header:

```text
Service A (generates traceId: abc-123)
  → calls Service B (reads x-trace-id, reuses abc-123)
    → calls Service C (same ID — full chain visible in logs)
```

Access it in your handler:

- **Express/Fastify**: `req.traceId`
- **All frameworks**: `getContext()?.traceId`

---

## Sensitive Data Protection

Field names matching this list are redacted before anything ships:

`authorization`, `password`, `token`, `api_key`, `cookie`, `secret`, `credit_card`, `ssn`, `private_key`, and more (case-insensitive).

```js
const { addField } = require('auto-api-observe');

addField('userId', 'u_123');           // shipped as-is
addField('authorization', 'Bearer x'); // shipped as "[REDACTED]"
```

---

## Global Tags

Attach metadata to every log entry for filtering in the dashboard. Every event also auto-tags its own **hostname** and **pid** — useful for telling instances apart even before you set any tags yourself:

```js
observe({
  apiKey: process.env.APILENS_KEY,
  tags: {
    service: 'user-api',
    env: process.env.NODE_ENV,
    region: 'us-east-1',
    version: '2.4.1',
  },
});
```

---

## Slow Request Detection

```js
observe({
  apiKey: process.env.APILENS_KEY,
  slowThreshold: 800, // ms — flag requests above this (default: 1000)
});
```

Route-level P95 latency in the dashboard tells you which endpoint owns a regression.

---

## Sampling & Route Filtering

```js
observe({
  apiKey: process.env.APILENS_KEY,
  sampleRate: 0.25,             // 0.0–1.0, fraction of requests to log
  skipRoutes: ['/health'],      // string prefix or RegExp
  maxRoutes: 1000,              // cap on distinct routes tracked in memory
});
```

---

## Process Metrics

```js
observe({
  apiKey: process.env.APILENS_KEY,
  processMetrics: 30000, // ms interval, or false to disable (default: 30000)
});
```

Each interval reports `rss`, `heapUsed`, `heapTotal`, `external`, CPU usage, load average, and free memory.

---

## Unhandled Error Capture

```js
observe({
  apiKey: process.env.APILENS_KEY,
  captureUnhandledErrors: true, // captures uncaughtException / unhandledRejection
});
```

Opt-in, since adding this listener changes Node's default process-exit behavior on an uncaught exception.

---

## Cloud Dashboard

Sign up free at [apilens.rest](https://apilens.rest) — no credit card required.

- **Overview** — total requests, error rate, P95 latency, interactive charts
- **Requests** — every request with full DB query details, trace IDs, filters
- **Routes** — per-route breakdown (calls, avg latency, P95, errors, slow count)
- **Errors** — paginated 4xx/5xx log with error timeline and top error routes
- **Slow Requests** — latency distribution and worst offenders
- **Database** — query profiling, N+1 detection, slow queries, source distribution
- **Outbound** — third-party API latency, error rates, call frequency
- **Traces** — distributed trace waterfall visualization
- **Live Tail** — real-time SSE stream with method/status/route filters
- **Usage** — daily quota tracking
- **Geographic** — traffic by country/city, unique IPs, bot vs. human traffic
- **Alerts** — email or Slack when error rate or latency spikes

<table>
<tr>
<td width="50%">

**Overview**
<img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/screenshots/overview.png" alt="Overview dashboard" width="100%" />

</td>
<td width="50%">

**All Requests**
<img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/screenshots/requests.png" alt="Requests log" width="100%" />

</td>
</tr>
<tr>
<td width="50%">

**Errors**
<img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/screenshots/errors.png" alt="Errors dashboard" width="100%" />

</td>
<td width="50%">

**Geographic Insights**
<img src="https://raw.githubusercontent.com/rahhuul/auto-api-observe/master/docs/screenshots/geographic.png" alt="Geographic insights" width="100%" />

</td>
</tr>
</table>

---

## In-Memory Metrics

Access per-route aggregates without sending anything to the cloud:

```js
const { getMetrics } = require('auto-api-observe');

app.get('/internal/metrics', (req, res) => res.json(getMetrics()));
```

Returns count, avg/min/max latency, error count, slow count, and status-code distribution — per route.

---

## Configuration

```ts
observe({
  // Required
  apiKey: process.env.APILENS_KEY, // get one free at apilens.rest

  // Request tracking
  slowThreshold: 1000,          // ms — flag requests above this (default: 1000)
  skipRoutes: ['/health'],      // string prefix or RegExp
  traceHeader: 'x-trace-id',    // header for trace ID propagation
  sampleRate: 1.0,              // 0.0–1.0, fraction to log (default: 1.0)
  maxRoutes: 1000,              // cap on distinct routes in metrics (default: 1000)

  // Callbacks
  onRequest: (ctx) => {},       // called at request start with context
  onResponse: (entry) => {},    // called after response with the log entry

  // Logging
  logger: console.log,          // custom log fn, or false to silence
  tags: { service: 'api' },     // global tags on every entry

  // DB instrumentation
  autoInstrument: true,         // auto-patch DB libraries (default: true)

  // Outbound HTTP
  autoInstrumentOutbound: true, // track fetch/axios/undici calls (default: true)

  // Process monitoring
  processMetrics: 30000,        // interval ms, or false to disable (default: 30000)
  captureUnhandledErrors: false,// capture uncaughtException/unhandledRejection

  // Cloud shipper
  endpoint: 'https://api.apilens.rest/v1/ingest', // override for self-hosted
  flushInterval: 5000,          // ms between batch flushes (default: 5000)
  flushSize: 100,               // flush when queue hits this size (default: 100)
});
```

---

## TypeScript

```ts
import observe, {
  fastifyObservability,
  koaObservability,
  honoObservability,
  createNestObservabilityInterceptor,
  withNextObservability,
  withAppRouterObservability,
  hapiObservabilityPlugin,
  elysiaObservability,
  apolloObservabilityPlugin,
  withLambdaObservability,
  createTrpcObservabilityMiddleware,
  createRestifyMiddleware,
  ObservabilityOptions,
  LogEntry,
  RequestContext,
  DbQuery,
  addField,
  getContext,
  getMetrics,
  resetMetrics,
  autoInstrument,
} from 'auto-api-observe';
```

---

## Comparison

| Feature | **auto-api-observe** | Datadog | New Relic | Sentry |
|---|:---:|:---:|:---:|:---:|
| Setup time | **10 seconds** | 30+ min | 30+ min | 15+ min |
| Lines of code | **1** | 20+ | 15+ | 10+ |
| Runtime dependencies | **0** | 50+ | 40+ | 30+ |
| Frameworks supported | **12** | agent-based | agent-based | SDK per framework |
| Auto DB tracking | **9 libraries** | custom setup | custom setup | limited |
| Outbound HTTP tracking | **auto** | auto | auto | manual |
| Process metrics | **built-in** | agent | agent | no |
| Free tier | **free during beta** | 14-day trial | 100 GB/mo | 5k events |

---

## Architecture

```text
┌─────────────────────────────────────┐
│           Your Node.js API           │
│                                       │
│  Express · Fastify · Koa · Hono      │
│  NestJS · Next.js · Lambda · ...     │
└─────────────────┬─────────────────────┘
                   │ auto-api-observe
                   ▼
        ┌─────────────────────┐
        │  Request Context    │
        │  DB Instrumentation │
        │  Outbound HTTP      │
        │  Trace IDs          │
        │  Process Metrics    │
        │  Data Masking       │
        └──────────┬──────────┘
                   │ batched telemetry
                   ▼
        ┌─────────────────────┐
        │    APILens Cloud    │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │     APILens UI      │
        │ Requests · Errors   │
        │ Routes · DB · Trace │
        │ Live Tail · Alerts  │
        └─────────────────────┘
```

The cloud endpoint can be overridden for a compatible self-hosted ingest.

---

## When should you use it?

Use `auto-api-observe` when you:

- build Node.js APIs and want production request visibility fast
- need database/query latency shown alongside the request that caused it
- want route-level latency and error metrics without an agent
- need simple distributed request correlation across services
- don't want to operate a full observability stack for one API

It isn't trying to replace a large enterprise observability platform. If you need broad infrastructure monitoring across many systems, a bigger stack may be the better fit.

---

## Testing

```bash
git clone https://github.com/rahhuul/auto-api-observe.git
cd auto-api-observe
npm install
npm test       # vitest — unit + integration suite
npm run build  # TypeScript compile check
```

---

## Contributing

Contributions are welcome — bug fixes, documentation, tests, framework adapters, and performance improvements.

Open an issue before submitting large changes so we can agree on the approach first.

---

## Roadmap

Areas being explored:

- deeper framework integrations
- richer trace visualization
- additional database instrumentation
- improved sampling/performance controls
- more alerting destinations
- stronger self-hosted workflows

Have an idea? [Open an issue](https://github.com/rahhuul/auto-api-observe/issues).

---

## Security

Please don't file security vulnerabilities as public issues — reach out directly instead.

Never commit API keys, access tokens, production credentials, customer data, or private telemetry.

---

## License

MIT © [Rahul Patel](https://github.com/rahhuul)

---

<p align="center">
  <strong>If auto-api-observe saves you debugging time, please <a href="https://github.com/rahhuul/auto-api-observe">⭐ star the repo</a> — it helps others find it.</strong>
</p>

<p align="center">
  Built by <a href="https://github.com/rahhuul">@rahhuul</a> ·
  <a href="https://x.com/rahhuul310">Twitter</a> ·
  <a href="https://apilens.rest">apilens.rest</a> ·
  <a href="https://www.npmjs.com/package/auto-api-observe">npm</a> ·
  <a href="https://github.com/rahhuul/auto-api-observe/blob/master/CHANGELOG.md">Changelog</a>
</p>
