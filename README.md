# auto-api-observe

> Zero-config observability middleware for Express and Fastify.  
> Add structured JSON logs, distributed trace IDs, slow-request detection, DB call counting, and in-memory metrics with a single line.

[![npm version](https://img.shields.io/npm/v/auto-api-observe.svg)](https://www.npmjs.com/package/auto-api-observe)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

| Feature | Details |
|---|---|
| **Structured JSON logs** | Every response emits a clean JSON entry |
| **Distributed trace IDs** | Auto-generated UUID per request, forwarded via `x-trace-id` header |
| **Slow API detection** | Requests above a configurable threshold are flagged with `slow: true` |
| **DB call counting** | Call `trackDbCall()` anywhere in your async chain — no config needed |
| **In-memory metrics** | Aggregated per-route stats accessible via `getMetrics()` |
| **Custom fields** | Attach arbitrary data to any request log entry via `addField()` |
| **TypeScript-first** | Full type definitions included |
| **Zero dependencies** | Pure Node.js — no runtime dependencies |

---

## Install

```bash
npm install auto-api-observe
```

Express and Fastify are optional peer dependencies — install whichever you use.

---

## Quick start

### Express

```js
const express = require('express');
const observability = require('auto-api-observe');

const app = express();

app.use(observability()); // ← that's it

app.get('/users', async (req, res) => {
  res.json({ users: [] });
});

app.listen(3000);
```

**Output for every request:**

```json
{
  "timestamp": "2026-03-05T12:00:00.000Z",
  "traceId": "a1b2c3d4-...",
  "method": "GET",
  "route": "/users",
  "status": 200,
  "latencyMs": "120ms",
  "dbCalls": 0,
  "slow": false,
  "ip": "127.0.0.1"
}
```

---

### Fastify

```js
const Fastify = require('fastify');
const { fastifyObservability } = require('auto-api-observe');

const fastify = Fastify();

await fastify.register(fastifyObservability); // ← that's it

fastify.get('/products', async () => ({ products: [] }));

await fastify.listen({ port: 3000 });
```

---

## Tracking DB calls

Use `trackDbCall()` anywhere in your async request chain.  
It automatically finds the right request context via `AsyncLocalStorage` — no need to pass anything explicitly.

```js
const { trackDbCall } = require('auto-api-observe');

async function getUser(id) {
  trackDbCall(); // ← increments dbCalls for the current request
  return db.query('SELECT * FROM users WHERE id = ?', [id]);
}
```

The log output will include `"dbCalls": 3` when the route makes 3 queries:

```json
{
  "route": "/users",
  "latencyMs": "120ms",
  "dbCalls": 3,
  "status": 200
}
```

You can also wrap an entire query helper in one call:

```js
trackDbCall(3); // count 3 calls at once
```

---

## Adding custom fields

Attach extra data to the current request's log entry from anywhere in your code:

```js
const { addField } = require('auto-api-observe');

app.get('/orders', async (req, res) => {
  const orders = await getOrders(req.user.id);
  addField('userId', req.user.id);   // appears in the log entry
  addField('orderCount', orders.length);
  res.json(orders);
});
```

---

## Metrics

Access aggregated in-memory stats at any time:

```js
const { getMetrics } = require('auto-api-observe');

app.get('/metrics', (req, res) => {
  res.json(getMetrics());
});
```

**Response shape:**

```json
{
  "totalRequests": 142,
  "successRequests": 135,
  "clientErrorRequests": 3,
  "errorRequests": 4,
  "slowRequests": 2,
  "uptime": 3600,
  "startedAt": "2026-03-05T08:00:00.000Z",
  "routes": {
    "GET /users": {
      "count": 80,
      "avgLatency": 95,
      "minLatency": 12,
      "maxLatency": 1400,
      "errors": 0,
      "slowCount": 1,
      "statusCodes": { "200": 80 }
    }
  }
}
```

Reset metrics (useful in tests):

```js
const { resetMetrics } = require('auto-api-observe');
resetMetrics();
```

---

## Options

All options are optional — zero config required.

```ts
observability({
  slowThreshold: 1000,       // ms — requests above this are flagged slow (default: 1000)
  logger: myLoggerFn,        // custom log function, or `false` to silence logs
  enableMetrics: true,       // collect in-memory metrics (default: true)
  skipRoutes: ['/health'],   // skip these routes entirely (string prefix or RegExp)
  traceHeader: 'x-trace-id', // header used for trace ID propagation (default: 'x-trace-id')
  onRequest: (ctx) => {},    // called at the start of each tracked request
  onResponse: (entry) => {}, // called after each tracked response
});
```

### Custom logger

Supply any function that accepts a `LogEntry`:

```js
const { createExpressMiddleware } = require('auto-api-observe');

app.use(createExpressMiddleware({
  logger: (entry) => {
    // Ship to Datadog, Loki, CloudWatch, etc.
    myLogShipper.send(entry);
  },
}));
```

Disable console output entirely:

```js
app.use(observability({ logger: false }));
```

---

## Distributed tracing

Every request automatically gets a `traceId`. If an upstream service passes the `x-trace-id` header, the same ID is used (enabling distributed tracing across services).

The trace ID is also set on the response header so downstream services can propagate it.

```
→ Service A  (generates traceId: abc-123, sets x-trace-id: abc-123)
→ Service B  (reads x-trace-id: abc-123, uses same ID in its logs)
→ Service C  (same)
```

Access the trace ID inside a request handler:

```js
app.get('/items', (req, res) => {
  console.log(req.traceId); // 'abc-123'
  res.json({});
});
```

---

## TypeScript

Full types are exported:

```ts
import observability, {
  ObservabilityOptions,
  LogEntry,
  Metrics,
  trackDbCall,
  addField,
  getMetrics,
} from 'auto-api-observe';

const options: ObservabilityOptions = {
  slowThreshold: 500,
  onResponse: (entry: LogEntry) => {
    if (entry.slow) alertTeam(entry);
  },
};

app.use(observability(options));
```

---

## Examples

```bash
# Express (basic)
npm run example:express

# Fastify
npm run example:fastify
```

---

## Log entry shape

```ts
interface LogEntry {
  timestamp: string;    // ISO-8601
  traceId: string;      // UUID v4
  method: string;       // 'GET', 'POST', …
  route: string;        // '/users/:id'  (matched pattern)
  path: string;         // '/users/42'   (raw URL)
  status: number;       // HTTP status code
  latency: number;      // milliseconds (number)
  latencyMs: string;    // '42ms'  (human-readable)
  dbCalls: number;      // tracked via trackDbCall()
  slow: boolean;        // true when latency > slowThreshold
  ip?: string;
  userAgent?: string;
  [key: string]: unknown; // custom fields from addField()
}
```

---

## License

MIT
