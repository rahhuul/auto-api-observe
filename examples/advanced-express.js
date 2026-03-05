/**
 * Advanced Express example — custom logger, skip routes, onResponse hook
 *
 * Run:  node examples/advanced-express.js
 */

const express = require('express');
const { createExpressMiddleware, trackDbCall, getMetrics } = require('../dist/index');

const app = express();
app.use(express.json());

// ─── Custom silent JSON logger (e.g. write to a log file / external service) ──
function silentJsonLogger(entry) {
  // In production you might pipe this to Datadog, Loki, etc.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

app.use(
  createExpressMiddleware({
    slowThreshold: 300,
    logger: silentJsonLogger,
    skipRoutes: ['/health', '/ready', /^\/internal/],
    traceHeader: 'x-request-id',          // use a custom header name
    onRequest: (ctx) => {
      console.log(`→ [${ctx.traceId}] request started`);
    },
    onResponse: (entry) => {
      if (entry.slow) {
        console.warn(`⚠  SLOW REQUEST: ${entry.method} ${entry.route} took ${entry.latencyMs}`);
      }
    },
  })
);

async function fakeQuery() {
  trackDbCall();
  await new Promise((r) => setTimeout(r, 50));
}

app.get('/orders', async (_req, res) => {
  await fakeQuery();
  await fakeQuery();
  res.json({ orders: [] });
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', (_req, res) => res.json({ ready: true }));

app.get('/metrics', (_req, res) => res.json(getMetrics()));

app.listen(3002, () => console.log('Advanced example on http://localhost:3002'));
