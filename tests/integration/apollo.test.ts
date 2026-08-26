/**
 * Integration tests for apolloObservabilityPlugin. Uses a real ApolloServer.
 */
import { describe, it, expect } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { apolloObservabilityPlugin } from '../../src/middleware/apollo';

const typeDefs = `
  type Query {
    hello: String
    boom: String
  }
`;
const resolvers = {
  Query: {
    hello: () => 'world',
    boom: () => { throw new Error('boom'); },
  },
};

async function buildServer(entries: unknown[]): Promise<ApolloServer> {
  return new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [apolloObservabilityPlugin({ apiKey: 'test_key', logger: false, onResponse: (e) => entries.push(e) })],
  });
}

describe('apolloObservabilityPlugin — basics', () => {
  it('logs a successful query with status 200', async () => {
    const entries: unknown[] = [];
    const server = await buildServer(entries);

    const res = await server.executeOperation({ query: '{ hello }' });
    expect(res.body.kind).toBe('single');
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBe(200);
    await server.stop();
  });
});

describe('apolloObservabilityPlugin — logs entries for resolvers that throw', () => {
  // Apollo's willSendResponse lifecycle hook is guaranteed to fire once per
  // request (success or GraphQL error) — asserted explicitly as a
  // regression guard.
  it('logs a query whose resolver throws with an error status', async () => {
    const entries: unknown[] = [];
    const server = await buildServer(entries);

    const res = await server.executeOperation({ query: '{ boom }' });
    const errors = res.body.kind === 'single' ? res.body.singleResult.errors : undefined;
    expect(errors).toBeTruthy();
    expect(entries).toHaveLength(1);
    expect((entries[0] as { status: number }).status).toBeGreaterThanOrEqual(400);
    await server.stop();
  });
});
