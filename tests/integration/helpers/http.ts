import http from 'http';

export function request(
  server: http.Server,
  opts: { method?: string; path: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path: opts.path, method: opts.method ?? 'GET', headers: opts.headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers as Record<string, string>, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}
