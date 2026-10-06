const express = require('express');
const app = express();

app.get('/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(4000, () => console.log('baseline (no observe) listening on :4000'));
