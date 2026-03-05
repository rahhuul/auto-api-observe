/**
 * Express example — auto-api-observe
 *
 * Run:  node examples/express-example.js
 * Then: curl http://localhost:3000/users
 *       curl http://localhost:3000/users/42
 *       curl http://localhost:3000/metrics
 */

const express = require('express');
const observability = require('../dist/index');

const app = express();
app.use(express.json());

// ─── 1. Drop in the middleware — zero config required ────────────────────────
app.use(observability());

// ─── 2. Simulated DB helper — uses trackDbCall() for automatic counting ───────
async function fakeDbQuery(label) {
  observability.trackDbCall();           // counts one DB call for this request
  await new Promise((r) => setTimeout(r, Math.random() * 30)); // simulate latency
  return { label, data: 'result' };
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/users', async (req, res) => {
  const users = await fakeDbQuery('SELECT * FROM users');
  const perms  = await fakeDbQuery('SELECT * FROM permissions');
  const config = await fakeDbQuery('SELECT * FROM config');

  // Attach a custom field to this request's log entry
  observability.addField('resultCount', 3);

  res.json({ users, perms, config });
});

app.get('/users/:id', async (req, res) => {
  const user = await fakeDbQuery(`SELECT * FROM users WHERE id=${req.params.id}`);
  res.json(user);
});

app.get('/slow', async (req, res) => {
  // Simulate a slow endpoint (>1 s default threshold)
  await new Promise((r) => setTimeout(r, 1200));
  res.json({ message: 'finally done' });
});

app.get('/error', (_req, res) => {
  res.status(500).json({ error: 'Something went wrong' });
});

// ─── Metrics dashboard ───────────────────────────────────────────────────────
app.get('/metrics', (_req, res) => {
  res.json(observability.getMetrics());
});

// ─── Health (skipped from observability in the second example below) ─────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(3000, () => {
  console.log('Express app running on http://localhost:3000');
  console.log('Try:');
  console.log('  GET  /users          — 3 DB calls, shows dbCalls: 3');
  console.log('  GET  /users/42       — single DB call');
  console.log('  GET  /slow           — triggers slow: true in the log');
  console.log('  GET  /error          — 500 status');
  console.log('  GET  /metrics        — in-memory aggregated metrics');
});
