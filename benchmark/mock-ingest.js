// Minimal always-202 ingest sink so the benchmark measures the middleware's
// own overhead, not latency to the real apilens.rest endpoint.
const http = require('http');

const server = http.createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end('{"stored":1,"dropped":0}');
  });
});

server.listen(4100, () => console.log('mock ingest listening on :4100'));
