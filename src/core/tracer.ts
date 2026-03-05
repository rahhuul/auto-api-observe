import { randomUUID } from 'crypto';

/**
 * Generates a RFC-4122 v4 UUID as a trace ID using Node's built-in
 * `crypto.randomUUID()` (available since Node 14.17 — well within the
 * declared engine requirement of >=16).
 */
export function generateTraceId(): string {
  return randomUUID();
}
