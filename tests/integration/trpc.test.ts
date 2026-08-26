/**
 * Integration tests for createTrpcObservabilityMiddleware. Uses a real tRPC router + caller.
 */
import { describe, it, expect } from 'vitest';
import { initTRPC } from '@trpc/server';
import { createTrpcObservabilityMiddleware } from '../../src/middleware/trpc';

function buildCaller(entries: unknown[]) {
  const t = initTRPC.create();
  const isObserved = t.middleware(createTrpcObservabilityMiddleware({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) }));
  const publicProcedure = t.procedure.use(isObserved);
  const router = t.router({
    hello: publicProcedure.query(() => 'world'),
    boom:  publicProcedure.query(() => { throw new Error('boom'); }),
  });
  return router.createCaller({});
}

describe('createTrpcObservabilityMiddleware — basics', () => {
  it('logs a successful query with status 200', async () => {
    const entries: unknown[] = [];
    const caller = buildCaller(entries);

    const result = await caller.hello();
    expect(result).toBe('world');
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
  });
});

describe('createTrpcObservabilityMiddleware — logs entries for procedures that throw', () => {
  it('logs a procedure that throws with status 500, and still throws to the caller', async () => {
    const entries: unknown[] = [];
    const caller = buildCaller(entries);

    await expect(caller.boom()).rejects.toThrow();
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
  });
});
