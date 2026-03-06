import { request as httpsRequest } from 'https';
import { request as httpRequest }  from 'http';
import type { IncomingMessage }    from 'http';
import type { LogEntry }           from '../types';

export interface ShipperOptions {
  apiKey:        string;
  endpoint:      string;
  flushInterval: number;   // ms between automatic flushes (default 5000)
  flushSize:     number;   // flush when queue reaches this size (default 100)
}

/**
 * Batches LogEntry objects and ships them to the ObserveAPI ingest endpoint.
 * Uses Node's built-in http/https modules — zero extra dependencies.
 */
export class RemoteShipper {
  private queue:    LogEntry[] = [];
  private timer:    NodeJS.Timeout | null = null;
  private readonly opts: ShipperOptions;

  constructor(opts: ShipperOptions) {
    this.opts = opts;
    this.startTimer();

    // Flush remaining events on process exit
    process.on('beforeExit', () => this.flush());
  }

  push(entry: LogEntry): void {
    this.queue.push(entry);
    if (this.queue.length >= this.opts.flushSize) {
      this.flush();
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.flush(), this.opts.flushInterval);
    // Don't keep the process alive just for shipping
    if (this.timer.unref) this.timer.unref();
  }

  flush(): void {
    if (this.queue.length === 0) return;

    const batch  = this.queue.splice(0, this.queue.length);
    const body   = JSON.stringify({ events: batch });
    const url    = new URL(this.opts.endpoint);
    const isHttps = url.protocol === 'https:';

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'POST',
      headers: {
        'content-type':   'application/json',
        'content-length': Buffer.byteLength(body),
        'x-api-key':      this.opts.apiKey,
      },
    };

    const req = (isHttps ? httpsRequest : httpRequest)(
      options,
      (res: IncomingMessage) => {
        // Drain response body to free the socket
        res.resume();
        if (res.statusCode === 429) {
          // Quota exceeded — stop shipping silently, don't retry
        }
      }
    );

    req.on('error', () => {
      // Network error — silently drop. Observability must never crash the app.
    });

    req.write(body);
    req.end();
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
