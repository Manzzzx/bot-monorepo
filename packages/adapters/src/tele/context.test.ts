import { describe, expect, it, vi } from 'vitest';
import type { Context as GrammyContext } from 'grammy';
import type { AppContext } from '@bot/contracts';
import { createTeleMessageCtx } from './context.js';

function makeApp(): Pick<AppContext, 'logger' | 'rateLimit'> {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child() {
      return this;
    },
  };
  const limiter = { schedule: (fn: () => Promise<void>) => fn() } as unknown as ReturnType<
    AppContext['rateLimit']['outbound']
  >;
  return {
    logger: logger as unknown as AppContext['logger'],
    rateLimit: { outbound: () => limiter },
  };
}

describe('createTeleMessageCtx', () => {
  it('builds a MessageCtx from a grammY update', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const update = {
      message: {
        message_id: 42,
        chat: { id: 123, type: 'private' },
        from: { id: 7, is_bot: false },
        date: 1700000000,
        text: '/ping',
      },
      api: { sendMessage },
    } as unknown as GrammyContext;

    const app = makeApp();
    const ctx = createTeleMessageCtx({ app }, update);

    expect(ctx.platform).toBe('tele');
    expect(ctx.chatId).toBe('123');
    expect(ctx.userId).toBe('7');
    expect(ctx.text).toBe('/ping');
    expect(ctx.isGroup).toBe(false);
    expect(ctx.chatType).toBe('private');
    expect(ctx.capabilities).toMatchObject({
      buttons: true,
      list: true,
      edit: true,
      reactions: true,
    });

    await ctx.reply('hi');
    expect(sendMessage).toHaveBeenCalledWith('123', 'hi', {});
  });

  it('captures username and chatName for group updates', () => {
    const update = {
      message: {
        message_id: 99,
        chat: { id: -1001234567890, type: 'supergroup', title: 'Bot Test' },
        from: { id: 42, is_bot: false, username: 'Mannn678', first_name: 'Manzz' },
        date: 1700000000,
        text: '/stats',
      },
      api: { sendMessage: vi.fn() },
    } as unknown as GrammyContext;

    const app = makeApp();
    const ctx = createTeleMessageCtx({ app }, update);

    expect(ctx.chatType).toBe('group');
    expect(ctx.chatName).toBe('Bot Test');
    expect(ctx.userName).toBe('Mannn678');
    expect(ctx.isGroup).toBe(true);
  });
});
