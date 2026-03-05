import { AsyncLocalStorage } from 'async_hooks';
import { RequestContext } from '../types';

export const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the RequestContext for the currently executing async chain,
 * or `undefined` when called outside a tracked request.
 */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Increment the DB-call counter for the current request.
 * Safe to call from anywhere — no-ops outside a tracked request.
 */
export function trackDbCall(count = 1): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.dbCalls += count;
  }
}

/**
 * Attach arbitrary key/value pairs to the current request's log entry.
 * Safe to call from anywhere — no-ops outside a tracked request.
 *
 * @example
 * addField('userId', req.user.id);
 * addField('plan', 'pro');
 */
export function addField(key: string, value: unknown): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.customFields[key] = value;
  }
}
