/**
 * Real-MongoDB integration tests for the mongoose patcher.
 * Skips gracefully if no MongoDB is reachable locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { autoInstrument } from '../../../src/core/instrument';
import { isReachable, makeContext, storage } from './helpers';

const MONGO_HOST = process.env.MONGO_HOST || '127.0.0.1';
const MONGO_PORT = Number(process.env.MONGO_PORT || 27017);
const MONGO_DB = process.env.MONGO_DB || 'auto_api_observe_test';

describe('mongoose — real database', async () => {
  const reachable = await isReachable(MONGO_HOST, MONGO_PORT);
  const d = reachable ? describe : describe.skip;
  if (!reachable) {
    console.warn(`[mongoose.test.ts] Skipping — no MongoDB reachable at ${MONGO_HOST}:${MONGO_PORT}`);
  }

  d('with a real MongoDB', () => {
    let TestModel: mongoose.Model<{ name: string }>;

    beforeAll(async () => {
      autoInstrument();
      await mongoose.connect(`mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}`, { serverSelectionTimeoutMS: 3000 });
      TestModel = mongoose.model('AutoApiObserveTest', new mongoose.Schema({ name: String }));
      await TestModel.deleteMany({});
    });

    afterAll(async () => {
      await TestModel.deleteMany({});
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });

    it('captures insertOne and findOne exactly once each', async () => {
      const ctx = makeContext();
      await storage.run(ctx, async () => {
        await TestModel.collection.insertOne({ name: 'alice' });
        await TestModel.collection.findOne({ name: 'alice' });
      });
      expect(ctx.dbCallsDetail.calls).toBe(2);
      expect(ctx.dbCallsDetail.queries.every((q) => q.source === 'mongoose')).toBe(true);
    });

    it('findOne does not double-count via internal delegation to find (regression guard)', async () => {
      const N = 20;
      for (let i = 0; i < N; i++) await TestModel.collection.insertOne({ name: `n${i}` });

      const ctx = makeContext();
      await storage.run(ctx, async () => {
        for (let i = 0; i < N; i++) await TestModel.collection.findOne({ name: `n${i}` });
      });
      expect(ctx.dbCallsDetail.calls).toBe(N);
    });
  });
});
