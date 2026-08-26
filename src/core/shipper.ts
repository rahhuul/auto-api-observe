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

// Stay safely under the ObserveAPI ingest endpoint's body-size limit (5MB, see
// apps/backend's `bodyLimit` on the Fastify instance) so one oversized flush
// doesn't get rejected outright. A single event can itself be large — e.g. a
// bulk-loop request with thousands of DB queries — so this can't shrink much
// further without also capping how much per-request query detail is kept
// (see MAX_QUERIES_PER_REQUEST in storage.ts, which intentionally does not
// cap at a low number for exactly this reason).
const MAX_BATCH_BYTES = 4_000_000;

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
    const batch = this.queue.splice(0, this.queue.length);
    this.sendBatch(batch);
  }

  private sendBatch(batch: LogEntry[]): void {
    if (batch.length === 0) return;

    const body = JSON.stringify({ events: batch });

    // A batch that's too large would just get rejected by the ingest
    // endpoint's body-size limit — split and send the halves separately
    // instead of losing the whole batch.
    if (batch.length > 1 && Buffer.byteLength(body) > MAX_BATCH_BYTES) {
      const mid = Math.ceil(batch.length / 2);
      this.sendBatch(batch.slice(0, mid));
      this.sendBatch(batch.slice(mid));
      return;
    }

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
        } else if (res.statusCode && res.statusCode >= 400) {
          console.error(
            `[auto-api-observe] ingest request failed: HTTP ${res.statusCode} ` +
            `(dropped ${batch.length} event(s), ${Buffer.byteLength(body)} bytes)`
          );
        }
      }
    );

    req.on('error', (err: Error) => {
      // Network error — never crash the app, but surface it so silent data
      // loss is visible in the host app's logs.
      console.error(`[auto-api-observe] ingest request error: ${err.message} (dropped ${batch.length} event(s))`);
    });

    req.write(body);
    req.end();
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
