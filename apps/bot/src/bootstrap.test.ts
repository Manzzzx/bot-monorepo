import { describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '@bot/db';
import { bootstrap } from './bootstrap.js';

vi.mock('@bot/features', () => ({
  loadFeatures: vi.fn().mockResolvedValue([]),
}));

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    flush: vi.fn(),
    child() {
      return this;
    },
  };
}

type BootstrapArg = NonNullable<Parameters<typeof bootstrap>[0]>;
type BootstrapConfig = NonNullable<BootstrapArg['config']>;
type BootstrapLogger = NonNullable<BootstrapArg['logger']>;

describe('bootstrap', () => {
  it('builds AppContext with adapters disabled and skips startAdapters', async () => {
    const prisma = {
      $disconnect: vi.fn(),
    } as unknown as AppPrismaClient;

    const config: BootstrapConfig = {
      NODE_ENV: 'test',
      TZ: 'Asia/Jakarta',
      LOG_PII: false,
      LOG_LEVEL: 'error',
      LOG_DIR: 'C:/tmp',
      LOG_NO_COLOR: true,
      DATABASE_URL: 'file:./test.db',
      AUTH_ENCRYPTION_KEY: 'a'.repeat(64),
      WA_ENABLED: false,
      WA_RATE_MIN_TIME_MS: 0,
      TELE_ENABLED: false,
      TELE_RATE_MIN_TIME_MS: 0,
    } as BootstrapConfig;

    const result = await bootstrap({
      logger: makeLogger() as unknown as BootstrapLogger,
      prisma,
      config,
      startAdapters: false,
      loadFeatures: false,
    });

    expect(result.adapters.wa).toBeNull();
    expect(result.adapters.tele).toBeNull();
    expect(result.app.adapters.has('wa')).toBe(false);
    expect(result.app.adapters.has('tele')).toBe(false);
    expect(typeof result.app.scheduler.start).toBe('function');

    await result.scheduler.stop();
  });
});
