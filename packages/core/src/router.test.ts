import { createMockCtx, type AppContext, type Feature, type MessageCtx } from '@bot/contracts';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { CommandRegistryImpl } from './command-registry.js';
import { GuardRejection } from './errors.js';
import { InMemoryEventBus } from './event-bus.js';
import { RateLimitRegistryImpl } from './rate-limit.js';
import { createRouter } from './router.js';

function createMockApp(): AppContext {
  const registry = new CommandRegistryImpl();
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
    registry,
    adapters: { get: vi.fn(), has: vi.fn() },
  } as unknown as AppContext;
  app.bus = new InMemoryEventBus(app);
  return app;
}

function registerFeature(
  app: AppContext,
  feature: Feature,
  category: 'general' | 'owner' | 'group' = 'general',
) {
  app.registry.register(feature, category);
}

describe('createRouter', () => {
  it('dispatches parsed commands through middleware, guards, then handler', async () => {
    const app = createMockApp();
    const order: string[] = [];
    registerFeature(app, {
      name: 'general/ping',
      version: '1.0.0',
      middleware: [
        async (_ctx, next) => {
          order.push('feature');
          await next();
        },
      ],
      commands: [
        {
          name: 'ping',
          description: 'Ping',
          guards: [
            async (_ctx, next) => {
              order.push('guard');
              await next();
            },
          ],
          async handler(ctx) {
            order.push('handler');
            await ctx.reply(`${ctx.command}:${ctx.args[0]}:${ctx.flags.loud}`);
          },
        },
      ],
    });
    const ctx = createMockCtx({ text: '/ping hi --loud', traceId: '' });

    await createRouter(app).dispatch(ctx);

    expect(order).toEqual(['feature', 'guard', 'handler']);
    expect(ctx.reply).toHaveBeenCalledWith('ping:hi:true');
  });

  it('emits message events for non-command text', async () => {
    const app = createMockApp();
    const seen: MessageCtx[] = [];
    app.bus.on('message', (payload) => {
      seen.push(payload as MessageCtx);
    });
    const ctx = createMockCtx({ text: 'plain text' });

    await createRouter(app).dispatch(ctx);

    expect(seen).toEqual([ctx]);
  });

  it('replies for unknown commands', async () => {
    const app = createMockApp();
    const ctx = createMockCtx({ text: '/wat' });

    await createRouter(app).dispatch(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('wat'));
  });

  it('turns guard rejections into user-facing replies', async () => {
    const app = createMockApp();
    registerFeature(app, {
      name: 'general/secret',
      version: '1.0.0',
      commands: [
        {
          name: 'secret',
          description: 'Secret',
          guards: [
            async () => {
              throw new GuardRejection('Blocked');
            },
          ],
          handler: vi.fn(),
        },
      ],
    });
    const ctx = createMockCtx({ text: '/secret' });

    await createRouter(app).dispatch(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Blocked');
  });

  it('handles command handler errors through the error boundary', async () => {
    const app = createMockApp();
    registerFeature(app, {
      name: 'general/boom',
      version: '1.0.0',
      commands: [
        {
          name: 'boom',
          description: 'Boom',
          async handler() {
            throw new Error('boom');
          },
        },
      ],
    });
    const ctx = createMockCtx({ text: '/boom', traceId: 'trace-boom' });

    await createRouter(app).dispatch(ctx);

    expect(app.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', traceId: 'trace-boom' }),
      'Unhandled bot error',
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('trace-boom'));
  });
});