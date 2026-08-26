import { describe, it, expect } from 'vitest';
import { generateTraceId } from '../../src/core/tracer';

describe('generateTraceId', () => {
  it('returns a string', () => {
    expect(typeof generateTraceId()).toBe('string');
  });

  it('returns a valid UUID v4 format', () => {
    const id = generateTraceId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('generates a unique ID each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});
