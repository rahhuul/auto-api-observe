// Elysia is Bun-native — `.listen()` uses Bun.serve() internally, so this
// can't run under Vitest/Node like the other integration tests. Run with:
//   bun tests/bun/elysia.test.js
// (see the separate "elysia" job in .github/workflows/ci.yml)
//
// Regression coverage:
//  1. elysiaObservability() must return a plain function — `.use()` on
//     current Elysia (v1.x) calls a function plugin as `plugin(app)`; the
//     older `{ name, version, setup(app) }` object shape is NOT handled and
//     throws on every single use (confirmed: 100% broken, not an edge
//     case).
//  2. A request whose handler throws must still be logged — onAfterHandle
//     alone only fires on the success path.

const { Elysia } = require('elysia');
const { elysiaObservability } = require('../../dist/index.js');

const entries = [];
let failures = 0;

function assert(cond, message) {
  if (cond) {
    console.log(`  PASS - ${message}`);
  } else {
    console.log(`  FAIL - ${message}`);
    failures++;
  }
}

const app = new Elysia()
  .use(elysiaObservability({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }))
  .get('/health', () => ({ ok: true }))
  .get('/boom', () => { throw new Error('boom'); });

async function httpGet(url) {
  const res = await fetch(url);
  return { status: res.status };
}

(async () => {
  app.listen(0);
  await new Promise((r) => setTimeout(r, 200));
  const port = app.server.port;
  const base = `http://127.0.0.1:${port}`;

  const r1 = await httpGet(`${base}/health`);
  const r2 = await httpGet(`${base}/boom`);
  await new Promise((r) => setTimeout(r, 50));

  console.log('=== Elysia (Bun) ===');
  assert(r1.status === 200, 'health returns 200');
  assert(entries.length === 2, '2 entries captured (health + boom)');
  assert(entries[0]?.status === 200, 'health entry: status 200');
  assert(!!entries[1] && entries[1].status >= 400, 'boom entry captured with error status (regression: used to be silently skipped)');

  app.stop();
  console.log(failures === 0 ? 'Elysia: ALL PASS' : `Elysia: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
