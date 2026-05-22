import { describe, expect, it } from 'vitest';
import { parseDuration } from './time.js';

describe('parseDuration', () => {
  it('parses combined durations to milliseconds', () => {
    expect(parseDuration('1d2h30m15s')).toBe(95_415_000);
  });

  it('rejects empty durations', () => {
    expect(() => parseDuration('')).toThrow(/duration/i);
  });

  it('rejects invalid durations', () => {
    expect(() => parseDuration('1h wat')).toThrow(/invalid/i);
    expect(() => parseDuration('10x')).toThrow(/invalid/i);
  });
});
