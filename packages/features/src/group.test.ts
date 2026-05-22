import type { AppContext, MessageCtx } from '@bot/contracts';
import { createMockCtx } from '@bot/contracts';
import { describe, expect, it, vi } from 'vitest';
import antiLinkFeature from './group/antilink.js';
import kickFeature from './group/kick.js';
import muteFeature from './group/mute.js';
import welcomeFeature from './group/welcome.js';

vi.mock('@bot/db', () => ({
  groupRepo: {
    getOrCreate: vi.fn(async (_db, _platform, externalId) => ({
      id: `group-${externalId}`,
      platform: 'wa',
      externalId,
      config: { groupId: `group-${externalId}`, antiLink: false, muted: false, welcomeMsg: null },
    })),
  },
}));

function commandHandler(
  feature: { commands?: { name: string; handler(ctx: MessageCtx): Promise<void> }[] },
  name: string,
) {
  const found = feature.commands?.find((cmd) => cmd.name === name);
  if (!found) throw new Error(`missing command ${name}`);
  return found.handler;
}

function eventHandler(
  feature: {
    events?: { event: string; handler(payload: unknown, app: AppContext): Promise<void> }[];
  },
  name: string,
) {
  const found = feature.events?.find((event) => event.event === name);
  if (!found) throw new Error(`missing event ${name}`);
  return found.handler;
}

function bindApp(ctx: MessageCtx, app: AppContext): MessageCtx {
  return Object.assign(ctx, { app });
}

function makeApp(extras: Record<string, unknown> = {}): AppContext {
  return {
    config: {},
    logger: { error: vi.fn(), info: vi.fn() },
    bus: { emit: vi.fn(), on: vi.fn() },
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn() },
    rateLimit: { outbound: vi.fn() },
    registry: { register: vi.fn(), resolve: vi.fn(), list: vi.fn(() => []), byCategory: vi.fn() },
    adapters: { get: vi.fn(), has: vi.fn() },
    db: {
      group: { findUnique: vi.fn() },
      groupConfig: { upsert: vi.fn(async ({ create }) => create) },
    },
    ...extras,
  } as unknown as AppContext;
}

describe('group features', () => {
  it('mute toggles GroupConfig.muted', async () => {
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const app = makeApp({
      db: { group: { findUnique: vi.fn() }, groupConfig: { upsert } },
    });
    const ctx = bindApp(createMockCtx({ isGroup: true, chatId: 'g-1', args: ['on'] }), app);

    await commandHandler(muteFeature, 'mute')(ctx);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-g-1' },
        update: expect.objectContaining({ muted: true }),
        create: expect.objectContaining({ muted: true }),
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith('Group mute enabled.');
  });

  it('antilink command persists toggle and event deletes urls when enabled', async () => {
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const findUnique = vi.fn(async () => ({ id: 'group-g-1', config: { antiLink: true } }));
    const app = makeApp({
      db: { group: { findUnique }, groupConfig: { upsert } },
    });
    const ctx = bindApp(createMockCtx({ isGroup: true, chatId: 'g-1', args: ['on'] }), app);

    await commandHandler(antiLinkFeature, 'antilink')(ctx);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ antiLink: true }),
      }),
    );

    const messageHandler = eventHandler(antiLinkFeature, 'message');
    const deleteFn = vi.fn(async () => undefined);
    const replyFn = vi.fn(async () => undefined);
    const messageCtx = createMockCtx({
      isGroup: true,
      chatId: 'g-1',
      text: 'check https://example.com',
      delete: deleteFn,
      reply: replyFn,
    });

    await messageHandler(messageCtx, app);

    expect(deleteFn).toHaveBeenCalled();
    expect(replyFn).toHaveBeenCalled();
  });

  it('welcome stores template and group.join sends rendered message', async () => {
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const findUnique = vi.fn(async () => ({
      id: 'group-g-1',
      config: { welcomeMsg: 'Hi {user}, welcome to {group}!' },
    }));
    const sender = vi.fn(async () => undefined);
    const adapter = { platform: 'wa', sendMessage: sender };
    const app = makeApp({
      db: { group: { findUnique }, groupConfig: { upsert } },
      adapters: { get: vi.fn(() => adapter), has: vi.fn(() => true) },
    });
    const ctx = bindApp(
      createMockCtx({
        isGroup: true,
        chatId: 'g-1',
        args: ['Hi', '{user},', 'welcome', 'to', '{group}!'],
      }),
      app,
    );

    await commandHandler(welcomeFeature, 'welcome')(ctx);
    expect(upsert).toHaveBeenCalled();

    const handler = eventHandler(welcomeFeature, 'group.join');
    await handler(
      {
        platform: 'wa',
        chatId: 'g-1',
        groupName: 'Cool Group',
        users: [{ id: 'u-1', name: 'Ana' }],
      },
      app,
    );

    expect(sender).toHaveBeenCalledWith('g-1', 'Hi Ana, welcome to Cool Group!');
  });

  it('kick replies unsupported when adapter lacks capability', async () => {
    const adapter = { platform: 'wa', sendMessage: vi.fn() };
    const app = makeApp({ adapters: { get: vi.fn(() => adapter), has: vi.fn(() => true) } });
    const ctx = bindApp(createMockCtx({ isGroup: true, chatId: 'g-1', args: ['user-evil'] }), app);

    await commandHandler(kickFeature, 'kick')(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('unsupported'));
  });

  it('kick uses adapter capability when present', async () => {
    const kick = vi.fn(async () => undefined);
    const adapter = { platform: 'wa', sendMessage: vi.fn(), kickMember: kick };
    const app = makeApp({ adapters: { get: vi.fn(() => adapter), has: vi.fn(() => true) } });
    const ctx = bindApp(createMockCtx({ isGroup: true, chatId: 'g-1', args: ['user-evil'] }), app);

    await commandHandler(kickFeature, 'kick')(ctx);

    expect(kick).toHaveBeenCalledWith('g-1', 'user-evil');
    expect(ctx.reply).toHaveBeenCalledWith('Kicked user-evil.');
  });
});
