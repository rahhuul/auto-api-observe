import { describe, it, expect } from 'vitest';
import { storage, getContext, trackDbCall, recordDbQuery, addField, createDbCalls } from '../../src/core/storage';
import type { RequestContext } from '../../src/types';

function makeContext(): RequestContext {
  return { traceId: 'trace-1', startTime: Date.now(), dbCalls: 0, dbCallsDetail: createDbCalls(), customFields: {} };
}

describe('storage', () => {
  it('getContext returns undefined outside a run()', () => {
    expect(getContext()).toBeUndefined();
  });

  it('getContext returns the context inside a run()', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      expect(getContext()).toBe(ctx);
    });
  });

  it('trackDbCall increments dbCalls and adds manual entries', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      trackDbCall(1);
      trackDbCall(2);
      expect(ctx.dbCalls).toBe(3);
      expect(ctx.dbCallsDetail.calls).toBe(3);
      expect(ctx.dbCallsDetail.queries).toHaveLength(3);
      expect(ctx.dbCallsDetail.queries[0].source).toBe('manual');
    });
  });

  it('trackDbCall is a no-op outside a run()', () => {
    expect(() => trackDbCall(5)).not.toThrow();
  });

  it('recordDbQuery captures full query details', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      recordDbQuery({
        query: 'SELECT * FROM users WHERE id = ?',
        source: 'pg',
        executionTime: '2026-03-17T12:00:00.000Z',
        queryTime: 42,
      });
      recordDbQuery({
        query: 'INSERT INTO logs (action) VALUES (?)',
        source: 'pg',
        executionTime: '2026-03-17T12:00:00.050Z',
        queryTime: 15,
      });

      expect(ctx.dbCallsDetail.calls).toBe(2);
      expect(ctx.dbCallsDetail.totalTime).toBe(57);
      expect(ctx.dbCallsDetail.slowestQuery).toBe(42);
      expect(ctx.dbCallsDetail.queries).toHaveLength(2);
      expect(ctx.dbCallsDetail.queries[0].query).toBe('SELECT * FROM users WHERE id = ?');
      expect(ctx.dbCallsDetail.queries[1].queryTime).toBe(15);
      // Legacy counter stays in sync
      expect(ctx.dbCalls).toBe(2);
    });
  });

  it('keeps every query for a realistic bulk-import volume (no premature truncation)', () => {
    const ctx = makeContext();
    const BULK_ROWS = 5911; // matches a real production bulk-import test
    storage.run(ctx, () => {
      for (let i = 0; i < BULK_ROWS; i++) {
        recordDbQuery({
          query: `UPDATE memberibew SET x = ? WHERE id = ${i}`,
          source: 'mysql2',
          executionTime: '2026-08-26T00:00:00.000Z',
          queryTime: 1,
        });
      }

      expect(ctx.dbCallsDetail.calls).toBe(BULK_ROWS);
      expect(ctx.dbCallsDetail.totalTime).toBe(BULK_ROWS);
      expect(ctx.dbCallsDetail.queries).toHaveLength(BULK_ROWS);
      expect(ctx.dbCalls).toBe(BULK_ROWS);
    });
  });

  it('addField attaches key/value to customFields', () => {
    const ctx = makeContext();
    storage.run(ctx, () => {
      addField('userId', 'u123');
      addField('plan', 'pro');
      expect(ctx.customFields['userId']).toBe('u123');
      expect(ctx.customFields['plan']).toBe('pro');
    });
  });

  it('addField is a no-op outside a run()', () => {
    expect(() => addField('key', 'value')).not.toThrow();
  });
});
