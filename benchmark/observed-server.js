const express = require('express');
const observe = require('../dist/index.js');

const app = express();

app.use(observe({
  apiKey: 'bench_test_key_not_real',
  endpoint: 'http://localhost:4100',   // local mock sink, not production
  logger: false,                        // console noise would itself skew the benchmark
}));

app.get('/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(4001, () => console.log('observed (with observe) listening on :4001'));
