import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '@bot/contracts';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { createWaMessageCtx } from './context.js';

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

describe('createWaMessageCtx', () => {
  it('builds a MessageCtx from a Baileys upsert message', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const socket = { sendMessage } as unknown as WASocket;
    const message: WAMessage = {
      key: { remoteJid: '6281@s.whatsapp.net', id: 'wa-1', fromMe: false },
      messageTimestamp: 1000,
      message: { conversation: '!ping' },
    } as WAMessage;

    const app = makeApp();
    const ctx = createWaMessageCtx({ socket, app, logger: app.logger }, message);

    expect(ctx.platform).toBe('wa');
    expect(ctx.chatId).toBe('6281@s.whatsapp.net');
    expect(ctx.text).toBe('!ping');
    expect(ctx.isGroup).toBe(false);
    expect(ctx.chatType).toBe('private');
    expect(ctx.chatName).toBeUndefined();
    expect(ctx.capabilities).toMatchObject({
      buttons: false,
      list: false,
      edit: true,
      reactions: true,
    });

    await ctx.reply('hi');
    expect(sendMessage).toHaveBeenCalledWith('6281@s.whatsapp.net', { text: 'hi' }, {});
  });

  it('captures pushName as userName for private chats', () => {
    const sendMessage = vi.fn();
    const socket = { sendMessage } as unknown as WASocket;
    const message = {
      key: { remoteJid: '6289@s.whatsapp.net', id: 'wa-2', fromMe: false },
      messageTimestamp: 1000,
      message: { conversation: 'halo' },
      pushName: 'Manzz',
    } as unknown as WAMessage;

    const app = makeApp();
    const ctx = createWaMessageCtx({ socket, app, logger: app.logger }, message);

    expect(ctx.userName).toBe('Manzz');
    expect(ctx.chatType).toBe('private');
  });

  it('flags group chats and triggers async groupMetadata fetch', async () => {
    const sendMessage = vi.fn();
    const groupMetadata = vi.fn().mockResolvedValue({ subject: 'Sat Set Meet' });
    const socket = { sendMessage, groupMetadata } as unknown as WASocket;
    const message = {
      key: {
        remoteJid: '120363021987654321@g.us',
        id: 'wa-3',
        fromMe: false,
        participant: '6289@s.whatsapp.net',
      },
      messageTimestamp: 1000,
      message: { conversation: '/everyone' },
      pushName: 'Manzz',
    } as unknown as WAMessage;

    const app = makeApp();
    const ctx = createWaMessageCtx({ socket, app, logger: app.logger }, message);

    expect(ctx.chatType).toBe('group');
    expect(ctx.userId).toBe('6289@s.whatsapp.net');
    await new Promise((r) => setImmediate(r));
    expect(groupMetadata).toHaveBeenCalledWith('120363021987654321@g.us');
  });
});
