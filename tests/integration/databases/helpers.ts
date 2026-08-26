import net from 'net';
import { storage, createDbCalls } from '../../../src/core/storage';
import type { RequestContext } from '../../../src/types';

/** Checks whether host:port is accepting TCP connections, with a short timeout. */
export function isReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

export function makeContext(traceId = 'trace-db-int'): RequestContext {
  return { traceId, startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

export { storage };
