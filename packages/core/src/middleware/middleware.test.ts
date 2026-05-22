import { createMockCtx, type AppContext, type MessageCtx } from '@bot/contracts';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuardRejection } from '../errors.js';
import { cooldown } from './cooldown.js';
import { errorBoundary } from './error-boundary.js';
import { requireGroup } from './require-group.js';
import { requireOwner } from './require-owner.js';
import { withTraceId } from './with-trace-id.js';

function createMockApp(overrides: Partial<AppContext> = {}): AppContext {
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

  return {
    config: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      LOG_DIR: '.',
      LOG_NO_COLOR: true,
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
    bus: { emit: vi.fn(), on: vi.fn() },
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn() },
    rateLimit: { outbound: vi.fn() },
    registry: { register: vi.fn(), resolve: vi.fn(), list: vi.fn(), byCategory: vi.fn() },
    adapters: { get: vi.fn(), has: vi.fn() },
    ...overrides,
  } as AppContext;
}

async function runMiddleware(
  ctx: MessageCtx,
  middleware: (ctx: MessageCtx, next: () => Promise<void>) => Promise<void>,
) {
  const next = vi.fn().mockResolvedValue(undefined);
  await middleware(ctx, next);
  return next;
}

describe('core middleware', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows configured platform owners', async () => {
    const app = createMockApp();
    const ctx = createMockCtx({ platform: 'wa', userId: 'owner-wa' });

    const next = await runMiddleware(ctx, requireOwner(app));

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects non-owners', async () => {
    const app = createMockApp();
    const ctx = createMockCtx({ platform: 'tele', userId: 'intruder' });

    await expect(runMiddleware(ctx, requireOwner(app))).rejects.toBeInstanceOf(GuardRejection);
  });

  it('rejects private chats for group-only commands', async () => {
    await expect(
      runMiddleware(createMockCtx({ isGroup: false }), requireGroup()),
    ).rejects.toBeInstanceOf(GuardRejection);
  });

  it('blocks repeated cooldown keys', async () => {
    vi.useFakeTimers();
    const guard = cooldown({ ms: 1_000, scope: 'user' });
    const ctx = createMockCtx({ userId: 'u-1' });

    expect(await runMiddleware(ctx, guard)).toHaveBeenCalledOnce();
    await expect(runMiddleware(ctx, guard)).rejects.toBeInstanceOf(GuardRejection);

    vi.advanceTimersByTime(1_001);
    expect(await runMiddleware(ctx, guard)).toHaveBeenCalledOnce();
  });

  it('binds trace id and child logger fields', async () => {
    const childLogger = { child: vi.fn() } as unknown as Logger;
    const logger = { child: vi.fn().mockReturnValue(childLogger) } as unknown as Logger;
    const ctx = createMockCtx({ logger, traceId: '' });

    const next = await runMiddleware(ctx, withTraceId());

    expect(ctx.traceId).toHaveLength(26);
    expect(ctx.logger).toBe(childLogger);
    expect(logger.child).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: ctx.traceId, platform: 'wa' }),
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('replies with user-facing errors', async () => {
    const app = createMockApp();
    const ctx = createMockCtx();
    const boundary = errorBoundary(app);

    await boundary(ctx, async () => {
      throw new GuardRejection('Nope');
    });

    expect(ctx.reply).toHaveBeenCalledWith('Nope');
  });

  it('logs unknown errors and replies with trace code', async () => {
    const app = createMockApp();
    const ctx = createMockCtx({ traceId: 'trace-xyz' });
    const boundary = errorBoundary(app);

    await boundary(ctx, async () => {
      throw new Error('boom');
    });

    expect(app.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', traceId: 'trace-xyz' }),
      'Unhandled bot error',
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('trace-xyz'));
  });
});
