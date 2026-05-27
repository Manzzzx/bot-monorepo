import {
  CommandRegistryImpl,
  FeatureConflictError,
  InMemoryEventBus,
  RateLimitRegistryImpl,
  UnknownCategoryError,
} from '@bot/core';
import type { AppContext, Feature } from '@bot/contracts';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadFeatures, type FeatureRegistryEntry } from './_loader.js';

function createFeature(commandName: string): Feature {
  return {
    name: 'raw',
    version: '1.0.0',
    commands: [
      {
        name: commandName,
        description: commandName,
        async handler(ctx) {
          await ctx.reply(commandName);
        },
      },
    ],
  };
}

function featureEntry(baseName: string, commandName = baseName): FeatureRegistryEntry {
  return { baseName, feature: createFeature(commandName) };
}

function createMockApp(): AppContext {
  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    flush: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
  const app = {
    config: {
      NODE_ENV: 'test',
      TZ: 'Asia/Jakarta',
      LOG_LEVEL: 'error',
      LOG_DIR: '.',
      LOG_NO_COLOR: true,
      LOG_PII: false,
      DATABASE_URL: 'file:test.db',
      AUTH_ENCRYPTION_KEY: 'a'.repeat(64),
      WA_ENABLED: true,
      OWNER_WA: 'owner-wa',
      WA_RATE_MIN_TIME_MS: 800,
      TELE_ENABLED: true,
      TELEGRAM_BOT_TOKEN: 'token',
      OWNER_TG: 'owner-tg',
      TELE_RATE_MIN_TIME_MS: 50,
    },
    logger,
    db: {},
    bus: undefined,
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn() },
    rateLimit: new RateLimitRegistryImpl({ WA_RATE_MIN_TIME_MS: 800, TELE_RATE_MIN_TIME_MS: 50 }),
    registry: new CommandRegistryImpl(),
    adapters: { get: vi.fn(), has: vi.fn() },
  } as unknown as AppContext;
  app.bus = new InMemoryEventBus(app);
  return app;
}

describe('loadFeatures', () => {
  it('loads static feature entries in deterministic order', async () => {
    const app = createMockApp();

    const features = await loadFeatures(app, {
      registry: { general: [featureEntry('ping'), featureEntry('help')] },
    });

    expect(features.map((feature) => feature.name)).toEqual(['general/help', 'general/ping']);
    expect(app.registry.resolve('ping')?.feature.name).toBe('general/ping');
    expect(app.registry.resolve('help')?.feature.name).toBe('general/help');
    expect(app.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ autoGuard: 'none', source: 'static' }),
      'loaded feature general/help (auto-guard: none) [static]',
    );
  });

  it('injects category guards before registration', async () => {
    const app = createMockApp();

    await loadFeatures(app, {
      registry: { owner: [featureEntry('admin')], group: [featureEntry('mod')] },
    });

    expect(app.registry.resolve('admin')?.command.guards?.map((guard) => guard.name)).toEqual([
      'ownerGuard',
    ]);
    expect(app.registry.resolve('mod')?.command.guards?.map((guard) => guard.name)).toEqual([
      'groupAdminGuard',
    ]);
  });

  it('rejects unknown categories', async () => {
    await expect(
      loadFeatures(createMockApp(), {
        registry: { admin: [featureEntry('ping')] } as unknown as Record<
          string,
          readonly FeatureRegistryEntry[]
        >,
      }),
    ).rejects.toBeInstanceOf(UnknownCategoryError);
  });

  it('rejects duplicate features in the same category', async () => {
    await expect(
      loadFeatures(createMockApp(), {
        registry: { general: [featureEntry('ping'), featureEntry('ping', 'ping2')] },
      }),
    ).rejects.toBeInstanceOf(FeatureConflictError);
  });
});
