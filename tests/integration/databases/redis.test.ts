/**
 * Real-Redis integration tests for both the ioredis and node-redis patchers.
 * Skips gracefully if no Redis is reachable locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import IORedis from 'ioredis';
import { createClient } from 'redis';
import { autoInstrument } from '../../../src/core/instrument';
import { isReachable, makeContext, storage } from './helpers';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

describe('redis — real server', async () => {
  const reachable = await isReachable(REDIS_HOST, REDIS_PORT);
  const d = reachable ? describe : describe.skip;
  if (!reachable) {
    console.warn(`[redis.test.ts] Skipping — no Redis reachable at ${REDIS_HOST}:${REDIS_PORT}`);
  }

  d('ioredis', () => {
    let redis: IORedis;

    beforeAll(() => {
      autoInstrument();
      redis = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });
    });
    afterAll(async () => { await redis.quit(); });

    it('captures a SET exactly once, with the correct source', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await redis.set('auto-api-observe:test:ioredis', 'value');
      });
      expect(ctx.dbCallsDetail.calls).toBe(1);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('ioredis');
      expect(ctx.dbCallsDetail.queries[0].query).toBe('REDIS SET');
    });

    it('captures a bounded-parallelism batch correctly (no double-count, no over-suppression)', async () => {
      const N = 30;
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        const inFlight: Promise<unknown>[] = [];
        for (let i = 0; i < N; i++) {
          inFlight.push(redis.set(`auto-api-observe:test:ioredis:${i}`, 'v'));
          if (inFlight.length >= 10) await Promise.all(inFlight.splice(0, inFlight.length));
        }
        if (inFlight.length) await Promise.all(inFlight);
      });
      expect(ctx.dbCallsDetail.calls).toBe(N);
    });
  });

  d('node-redis', () => {
    let client: ReturnType<typeof createClient>;

    beforeAll(async () => {
      autoInstrument();
      client = createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
      await client.connect();
    });
    afterAll(async () => { await client.quit(); });

    it('captures a SET exactly once, with the correct source', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await client.set('auto-api-observe:test:node-redis', 'value');
      });
      expect(ctx.dbCallsDetail.calls).toBe(1);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('node-redis');
      expect(ctx.dbCallsDetail.queries[0].query).toBe('REDIS SET');
    });
  });
});
