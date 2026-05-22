import Bottleneck from 'bottleneck';
import type { Platform, RateLimitRegistry } from '@bot/contracts';

export interface RateLimitConfig {
  WA_RATE_MIN_TIME_MS: number;
  TELE_RATE_MIN_TIME_MS: number;
}

export class RateLimitRegistryImpl implements RateLimitRegistry {
  private readonly limiters = new Map<string, Bottleneck>();

  constructor(private readonly config: RateLimitConfig) {}

  outbound(platform: Platform, chatId: string): Bottleneck {
    const key = `${platform}:${chatId}`;
    const existing = this.limiters.get(key);
    if (existing) return existing;

    const minTime =
      platform === 'wa' ? this.config.WA_RATE_MIN_TIME_MS : this.config.TELE_RATE_MIN_TIME_MS;
    const limiter = new Bottleneck({ minTime });
    this.limiters.set(key, limiter);
    return limiter;
  }
}
