import { describe, expect, it, vi } from 'vitest';
import { backoffWithJitterMs } from './_backoff.js';

describe('backoffWithJitterMs', () => {
  it('returns the base delay when jitter is the midpoint', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(backoffWithJitterMs(1)).toBe(60_000);
    vi.restoreAllMocks();
  });

  it('expands exponentially up to the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(backoffWithJitterMs(1)).toBe(60_000);
    expect(backoffWithJitterMs(2)).toBe(120_000);
    expect(backoffWithJitterMs(3)).toBe(240_000);
    expect(backoffWithJitterMs(99)).toBe(30 * 60_000);
    vi.restoreAllMocks();
  });

  it('keeps the result inside ±10% of the base delay', () => {
    for (let i = 0; i < 100; i += 1) {
      const actual = backoffWithJitterMs(1);
      expect(actual).toBeGreaterThanOrEqual(54_000);
      expect(actual).toBeLessThanOrEqual(66_000);
    }
  });

  it('returns an integer value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    expect(Number.isInteger(backoffWithJitterMs(2))).toBe(true);
    vi.restoreAllMocks();
  });
});
