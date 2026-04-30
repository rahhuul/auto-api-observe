import { connect as netConnect, type Socket } from 'net';
import { connect as tlsConnect }              from 'tls';
import { randomBytes }                         from 'crypto';

/** Minimal WebSocket client using only Node built-ins (net/tls/crypto). No external dependencies. */
export class WsProcessClient {
  private socket:        Socket | null = null;
  private connected      = false;
  private destroyed      = false;
  private reconnectDelay = 1_000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly host:  string;
  private readonly port:  number;
  private readonly path:  string;
  private readonly secure: boolean;

  constructor(apiKey: string, endpoint: string) {
    const url    = new URL(endpoint);
    this.secure  = url.protocol === 'https:';
    this.host    = url.hostname;
    this.port    = url.port ? parseInt(url.port, 10) : (this.secure ? 443 : 80);
    this.path    = `/v1/ws/process?apiKey=${encodeURIComponent(apiKey)}`;
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;

    const opts = { host: this.host, port: this.port };
    const sock: Socket = this.secure
      ? tlsConnect({ ...opts, servername: this.host })
      : netConnect(opts);

    const sendUpgrade = () => {
      sock.write(
        `GET ${this.path} HTTP/1.1\r\n` +
        `Host: ${this.host}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`,
      );
    };

    if (this.secure) {
      sock.once('secureConnect' as 'connect', sendUpgrade);
    } else {
      sock.once('connect', sendUpgrade);
    }

    let headerDone = false;
    let headerBuf  = '';

    sock.on('data', (chunk: Buffer) => {
      if (headerDone) return; // drain server frames silently
      headerBuf += chunk.toString('latin1');
      if (!headerBuf.includes('\r\n\r\n')) return;
      headerDone = true;
      if (headerBuf.startsWith('HTTP/1.1 101')) {
        this.connected      = true;
        this.reconnectDelay = 1_000;
      } else {
        sock.destroy();
      }
    });

    sock.on('close',   () => { this.connected = false; if (!this.destroyed) this.scheduleReconnect(); });
    sock.on('error',   () => { this.connected = false; });
    sock.setTimeout(10_000, () => sock.destroy());

    this.socket = sock;
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
    (this.reconnectTimer as NodeJS.Timeout).unref?.();
  }

  /** Send a JSON object as a masked WebSocket text frame (RFC 6455). */
  send(data: object): void {
    if (!this.connected || !this.socket?.writable) return;
    try {
      const payload = Buffer.from(JSON.stringify(data));
      const len     = payload.length;
      if (len >= 65_536) return; // skip oversized frames

      // RFC 6455: client frames must be masked
      const mask   = randomBytes(4);
      const hdr    = Buffer.allocUnsafe(len < 126 ? 2 : 4);
      hdr[0] = 0x81; // FIN + text opcode
      let hdrLen: number;
      if (len < 126) {
        hdr[1] = 0x80 | len;
        hdrLen = 2;
      } else {
        hdr[1] = 0xfe;
        hdr[2] = (len >> 8) & 0xff;
        hdr[3] = len & 0xff;
        hdrLen = 4;
      }

      const frame = Buffer.allocUnsafe(hdrLen + 4 + len);
      hdr.copy(frame, 0, 0, hdrLen);
      mask.copy(frame, hdrLen);
      for (let i = 0; i < len; i++) {
        frame[hdrLen + 4 + i] = payload[i] ^ mask[i % 4];
      }

      this.socket.write(frame);
    } catch { /* silent — observability must never throw */ }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.socket?.destroy(); } catch { /* ignore */ }
  }
}
