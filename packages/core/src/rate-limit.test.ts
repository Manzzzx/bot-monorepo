import { describe, expect, it } from 'vitest';
import { RateLimitRegistryImpl } from './rate-limit.js';

describe('RateLimitRegistryImpl', () => {
  it('caches limiters by platform and chat id', () => {
    const registry = new RateLimitRegistryImpl({
      WA_RATE_MIN_TIME_MS: 800,
      TELE_RATE_MIN_TIME_MS: 50,
    });

    expect(registry.outbound('wa', 'chat-1')).toBe(registry.outbound('wa', 'chat-1'));
    expect(registry.outbound('wa', 'chat-1')).not.toBe(registry.outbound('wa', 'chat-2'));
    expect(registry.outbound('wa', 'chat-1')).not.toBe(registry.outbound('tele', 'chat-1'));
  });

  it('uses platform minTime config', () => {
    const registry = new RateLimitRegistryImpl({
      WA_RATE_MIN_TIME_MS: 800,
      TELE_RATE_MIN_TIME_MS: 50,
    });

    expect(
      (
        registry.outbound('wa', 'chat') as unknown as {
          _store: { storeOptions: { minTime: number } };
        }
      )._store.storeOptions.minTime,
    ).toBe(800);
    expect(
      (
        registry.outbound('tele', 'chat') as unknown as {
          _store: { storeOptions: { minTime: number } };
        }
      )._store.storeOptions.minTime,
    ).toBe(50);
  });
});
