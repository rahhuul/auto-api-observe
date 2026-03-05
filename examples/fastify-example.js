/**
 * Fastify example — auto-api-observe
 *
 * Run:  node examples/fastify-example.js
 * Then: curl http://localhost:3001/products
 *       curl http://localhost:3001/products/99
 *       curl http://localhost:3001/metrics
 */

const Fastify = require('fastify');
const { fastifyObservability, trackDbCall, addField, getMetrics } = require('../dist/index');

const fastify = Fastify();

// ─── 1. Register the plugin — zero extra config needed ───────────────────────
fastify.register(fastifyObservability, {
  slowThreshold: 500,           // flag anything over 500 ms as slow
  skipRoutes: ['/health'],      // health checks won't appear in logs/metrics
});

// ─── 2. Simulated DB helper ───────────────────────────────────────────────────
async function fakeDbQuery() {
  trackDbCall();
  await new Promise((r) => setTimeout(r, Math.random() * 20));
  return { id: Math.floor(Math.random() * 1000) };
}

// ─── Routes ──────────────────────────────────────────────────────────────────
fastify.get('/products', async (_req, reply) => {
  const [a, b] = await Promise.all([fakeDbQuery(), fakeDbQuery()]);
  addField('resultCount', 2);
  return reply.send([a, b]);
});

fastify.get('/products/:id', async (req, reply) => {
  const product = await fakeDbQuery();
  return reply.send({ ...product, id: req.params.id });
});

fastify.get('/slow', async (_req, reply) => {
  await new Promise((r) => setTimeout(r, 700));
  return reply.send({ message: 'slow response' });
});

fastify.get('/metrics', async (_req, reply) => {
  return reply.send(getMetrics());
});

fastify.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok' });
});

fastify.listen({ port: 3001, host: '0.0.0.0' }).then((address) => {
  console.log(`Fastify app running on ${address}`);
  console.log('Try:');
  console.log('  GET  /products       — 2 DB calls');
  console.log('  GET  /products/99    — single DB call');
  console.log('  GET  /slow           — triggers slow: true (>500 ms)');
  console.log('  GET  /metrics        — aggregated metrics');
  console.log('  GET  /health         — skipped from observability');
}).catch((err) => { console.error(err); process.exit(1); });
