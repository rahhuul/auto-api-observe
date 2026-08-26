/**
 * Integration tests for withLambdaObservability. Invokes the handler
 * directly (event, context) — the same way the real AWS Lambda runtime does,
 * no HTTP server involved.
 */
import { describe, it, expect } from 'vitest';
import { withLambdaObservability } from '../../src/middleware/lambda';

describe('withLambdaObservability — basics', () => {
  it('logs a successful invocation with status 200', async () => {
    const entries: unknown[] = [];
    const handler = withLambdaObservability(
      async () => ({ statusCode: 200, body: 'ok' }),
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    const result = await handler({ httpMethod: 'GET', path: '/health', headers: {} }, {});
    expect(result.statusCode).toBe(200);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
  });
});

describe('withLambdaObservability — logs entries for handlers that throw', () => {
  it('logs a handler that throws with status 500, and re-throws (Lambda convention)', async () => {
    const entries: unknown[] = [];
    const handler = withLambdaObservability(
      async () => { throw new Error('boom'); },
      { apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) },
    );

    await expect(handler({ httpMethod: 'GET', path: '/boom', headers: {} }, {})).rejects.toThrow('boom');
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(500);
  });
});
