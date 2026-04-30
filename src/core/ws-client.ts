type WsCtor = new (url: string) => {
  readyState: number;
  send(d: string): void;
  close(): void;
  onopen:  ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
};

function getWsCtor(): WsCtor | null {
  const g = globalThis as Record<string, unknown>;
  if (typeof g['WebSocket'] === 'function') return g['WebSocket'] as WsCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('ws') as WsCtor | { default: WsCtor };
    if (typeof mod === 'function') return mod;
    if (mod && typeof (mod as { default?: WsCtor }).default === 'function') return (mod as { default: WsCtor }).default;
  } catch { /* ws not installed */ }
  return null;
}

/** Persistent WebSocket client for shipping process metrics without consuming request quota. */
export class WsProcessClient {
  private ws:              InstanceType<WsCtor> | null = null;
  private readonly url:    string;
  private readonly WS:     WsCtor | null;
  private reconnectTimer:  ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private destroyed      = false;

  constructor(apiKey: string, endpoint: string) {
    const base = endpoint
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/v1\/ingest.*$/, '');
    this.url = `${base}/v1/ws/process?apiKey=${encodeURIComponent(apiKey)}`;
    this.WS  = getWsCtor();
    if (this.WS) this.connect();
  }

  private connect(): void {
    if (this.destroyed || !this.WS) return;
    try {
      this.ws          = new this.WS(this.url);
      this.ws.onopen   = () => { this.reconnectDelay = 1_000; };
      this.ws.onerror  = () => { /* silent — onclose will fire next */ };
      this.ws.onclose  = () => { if (!this.destroyed) this.scheduleReconnect(); };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
    (this.reconnectTimer as NodeJS.Timeout).unref?.();
  }

  send(data: object): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(data)); } catch { /* silent */ }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}
