import { ObservabilityOptions, RequestContext } from '../types';
import { storage, createDbCalls } from '../core/storage';
import { generateTraceId } from '../core/tracer';
import { setup, buildEntry, finalize } from '../core/factory';

// Duck-typed Apollo Server plugin interface (compatible with Apollo Server 4)
type ApolloPlugin = Record<string, unknown>;

/**
 * Apollo Server plugin for auto-api-observe.
 *
 * @example
 * import { ApolloServer } from '@apollo/server';
 * import { apolloObservabilityPlugin } from 'auto-api-observe';
 *
 * const server = new ApolloServer({
 *   typeDefs,
 *   resolvers,
 *   plugins: [apolloObservabilityPlugin({ apiKey: process.env.APILENS_KEY })],
 * });
 */
export function apolloObservabilityPlugin(options: ObservabilityOptions = {}): ApolloPlugin {
  const opts = setup(options);
  if (!opts) return {};

  return {
    async requestDidStart({ request }: Record<string, any>) {
      const traceId = request.http?.headers?.get?.(opts.traceHeader) ?? generateTraceId();
      const context: RequestContext = {
        traceId,
        startTime:     Date.now(),
        dbCalls:       0,
        dbCallsDetail: createDbCalls(),
        customFields:  {},
      };

      storage.enterWith(context);
      if (opts.onRequest) opts.onRequest(context);

      let hasErrors = false;
      return {
        async didEncounterErrors() { hasErrors = true; },
        async willSendResponse({ contextValue }: Record<string, any>) {
          const status    = hasErrors ? 500 : 200;
          const operation = request.operationName ?? 'graphql';
          const ip        = request.http?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim()
            ?? contextValue?.req?.ip
            ?? 'unknown';
          const ua = request.http?.headers?.get?.('user-agent') ?? undefined;

          const entry = buildEntry(opts, context, 'POST', operation, '/graphql', status, ip, ua);
          finalize(opts, entry);
        },
      };
    },
  };
}
