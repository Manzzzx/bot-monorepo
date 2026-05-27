import type {
  AppContext,
  Command,
  Feature,
  FeatureCategory,
  MessageCtx,
  RegisteredCommand,
} from '@bot/contracts';
import { createMockCtx } from '@bot/contracts/testing';
import { describe, expect, it, vi } from 'vitest';
import helpFeature from './general/help.js';
import menuFeature from './general/menu.js';
import pingFeature from './general/ping.js';
import statsFeature from './general/stats.js';

function command(feature: Feature, name: string): Command {
  const found = feature.commands?.find((item) => item.name === name);
  if (!found) throw new Error(`Missing command ${name}`);
  return found;
}

function entry(
  category: FeatureCategory,
  name: string,
  aliases: string[] = [],
): RegisteredCommand {
  return {
    command: {
      name,
      aliases,
      description: `${name} description`,
      usage: `/${name}`,
      async handler() {},
    },
    feature: { name: `${category}/${name}`, version: '1.0.0' },
    category,
    fullName: `${category}/${name}:${name}`,
  };
}

function createApp(entries: RegisteredCommand[], db: unknown = {}): AppContext {
  return {
    config: {
      NODE_ENV: 'test',
      TZ: 'Asia/Jakarta',
      LOG_LEVEL: 'info',
      LOG_DIR: 'logs',
      LOG_NO_COLOR: true,
      LOG_PII: false,
      DATABASE_URL: 'file:test.db',
      AUTH_ENCRYPTION_KEY: 'a'.repeat(64),
      WA_ENABLED: true,
      OWNER_WA: 'owner-wa',
      WA_RATE_MIN_TIME_MS: 1,
      TELE_ENABLED: true,
      OWNER_TG: 'owner-tg',
      TELE_RATE_MIN_TIME_MS: 1,
    },
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    db,
    bus: { emit: vi.fn(), on: vi.fn() },
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn() },
    rateLimit: { outbound: vi.fn() },
    registry: {
      register: vi.fn(),
      resolve: vi.fn(
        (name: string) =>
          entries.find(
            (item) =>
              item.command.name === name.toLowerCase() ||
              item.command.aliases?.includes(name.toLowerCase()),
          ) ?? null,
      ),
      list: vi.fn(() => entries),
      byCategory: vi.fn(() => ({
        general: entries.filter((item) => item.category === 'general'),
        owner: entries.filter((item) => item.category === 'owner'),
        group: entries.filter((item) => item.category === 'group'),
        downloader: entries.filter((item) => item.category === 'downloader'),
        stalker: entries.filter((item) => item.category === 'stalker'),
      })),
    },
    adapters: { get: vi.fn(), has: vi.fn() },
  } as unknown as AppContext;
}

function bindApp(ctx: MessageCtx, app: AppContext): MessageCtx {
  return Object.assign(ctx, { app });
}

function firstReplyText(ctx: MessageCtx): string {
  const calls = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls;
  return (calls[0]?.[0] as string) ?? '';
}

describe('general features', () => {
  it('ping reply shows pong and latency', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_500);
    const ctx = createMockCtx({ timestamp: 1_000 });

    await command(pingFeature, 'ping').handler(ctx);

    const text = firstReplyText(ctx);
    expect(text).toContain('Pong');
    expect(text).toContain('500');
  });

  it('stats includes uptime, memory, and commands', async () => {
    const entries = [entry('general', 'ping'), entry('owner', 'eval')];
    const app = createApp(entries, { $queryRawUnsafe: vi.fn().mockResolvedValue([{ ok: 1 }]) });
    const ctx = bindApp(createMockCtx(), app);

    await command(statsFeature, 'stats').handler(ctx);

    const text = firstReplyText(ctx);
    expect(text).toContain('Uptime');
    expect(text).toContain('Memory');
    expect(text).toContain('Commands');
    expect(text).toContain('2');
  });

  it('menu hides owner commands for non-owner and group commands in DMs', async () => {
    const app = createApp([
      entry('general', 'ping'),
      entry('owner', 'eval', ['js']),
      entry('group', 'kick'),
    ]);
    const nonOwnerDm = bindApp(createMockCtx({ userId: 'user-1', isGroup: false }), app);
    const ownerGroup = bindApp(createMockCtx({ userId: 'owner-wa', isGroup: true }), app);

    await command(menuFeature, 'menu').handler(nonOwnerDm);
    await command(menuFeature, 'menu').handler(ownerGroup);

    const dmText = firstReplyText(nonOwnerDm);
    const groupText = firstReplyText(ownerGroup);
    expect(dmText).toContain('General');
    expect(dmText).not.toContain('Owner');
    expect(dmText).not.toContain('Group');
    expect(groupText).toContain('Owner');
    expect(groupText).toContain('Group');
  });

  it('help hides owner names and aliases from non-owners', async () => {
    const app = createApp([entry('general', 'ping', ['p']), entry('owner', 'eval', ['js'])]);
    const ctx = bindApp(createMockCtx({ userId: 'user-1', args: [] }), app);

    await command(helpFeature, 'help').handler(ctx);

    const text = firstReplyText(ctx);
    expect(text).toContain('General');
    expect(text).not.toContain('Owner');
    expect(text).not.toContain('eval');
  });

  it('help ping shows description, usage, aliases, and category', async () => {
    const app = createApp([entry('general', 'ping', ['p'])]);
    const ctx = bindApp(createMockCtx({ args: ['ping'] }), app);

    await command(helpFeature, 'help').handler(ctx);

    const text = firstReplyText(ctx);
    expect(text).toContain('ping description');
    expect(text).toContain('/ping');
    expect(text).toContain('General');
    expect(text).toContain('p');
  });
});