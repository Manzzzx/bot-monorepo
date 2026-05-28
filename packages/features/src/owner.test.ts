import type { AppContext, MessageCtx } from '@bot/contracts';
import { createMockCtx } from '@bot/contracts/testing';
import { describe, expect, it, vi } from 'vitest';
import broadcastFeature from './owner/broadcast.js';
import evalFeature from './owner/eval.js';
import shutdownFeature from './owner/shutdown.js';

function commandHandler(
  feature: { commands?: { name: string; handler(ctx: MessageCtx): Promise<void> }[] },
  name: string,
) {
  const found = feature.commands?.find((cmd) => cmd.name === name);
  if (!found) throw new Error(`missing command ${name}`);
  return found.handler;
}

function bindApp(ctx: MessageCtx, app: AppContext & Record<string, unknown>): MessageCtx {
  return Object.assign(ctx, { app });
}

function baseApp(overrides: Partial<AppContext> = {}, extras: Record<string, unknown> = {}) {
  return {
    config: {},
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    bus: { emit: vi.fn(), on: vi.fn() },
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn() },
    rateLimit: { outbound: vi.fn() },
    registry: { register: vi.fn(), resolve: vi.fn(), list: vi.fn(() => []), byCategory: vi.fn() },
    adapters: { get: vi.fn(), has: vi.fn() },
    db: {},
    ...overrides,
    ...extras,
  } as unknown as AppContext & Record<string, unknown>;
}

describe('owner features', () => {
  it('exported features rely on loader-injected guards', () => {
    for (const feature of [evalFeature, broadcastFeature, shutdownFeature]) {
      for (const command of feature.commands ?? []) {
        expect(command.guards ?? []).toEqual([]);
      }
    }
  });

  it('eval evaluates expressions and caps output', async () => {
    const ctx = bindApp(createMockCtx({ args: ['1', '+', '1'] }), baseApp());
    await commandHandler(evalFeature, 'eval')(ctx);
    expect(ctx.reply).toHaveBeenCalledWith('2');

    const longCtx = bindApp(createMockCtx({ args: ["'x'.repeat(8000)"] }), baseApp());
    await commandHandler(evalFeature, 'eval')(longCtx);
    const lastCall = (longCtx.reply as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
    expect(lastCall.endsWith('output truncated')).toBe(true);
  });

  it('broadcast sends to known users and groups', async () => {
    const sender = vi.fn(async () => undefined);
    const adapter = { platform: 'wa', sendMessage: sender };
    const app = baseApp({
      adapters: { get: vi.fn(() => adapter), has: vi.fn(() => true) },
      db: {
        user: { findMany: vi.fn(async () => [{ platform: 'wa', externalId: 'u-1' }]) },
        group: { findMany: vi.fn(async () => [{ platform: 'tele', externalId: 'g-1' }]) },
      },
    } as unknown as Partial<AppContext>);
    const ctx = bindApp(createMockCtx({ args: ['hello', 'world'] }), app);

    await commandHandler(broadcastFeature, 'broadcast')(ctx);

    expect(sender).toHaveBeenCalledWith('u-1', 'hello world');
    expect(sender).toHaveBeenCalledWith('g-1', 'hello world');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('sent=2'));
  });

  it('shutdown invokes app shutdown hook', async () => {
    const shutdown = vi.fn(async () => undefined);
    const app = baseApp({}, { shutdown });
    const ctx = bindApp(createMockCtx({ args: ['restart'] }), app);

    await commandHandler(shutdownFeature, 'shutdown')(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('Shutdown requested.');
    expect(shutdown).toHaveBeenCalledWith('restart');
  });

  it('broadcast filters targets by --platform=tele flag', async () => {
    const sender = vi.fn(async () => undefined);
    const adapter = { platform: 'tele', sendMessage: sender };
    const userFindMany = vi.fn(async () => [{ platform: 'tele', externalId: 'tele-u' }]);
    const groupFindMany = vi.fn(async () => []);
    const app = baseApp({
      adapters: { get: vi.fn(() => adapter), has: vi.fn(() => true) },
      db: { user: { findMany: userFindMany }, group: { findMany: groupFindMany } },
    } as unknown as Partial<AppContext>);
    const ctx = bindApp(
      createMockCtx({ args: ['hi'], flags: { platform: 'tele' } }),
      app,
    );

    await commandHandler(broadcastFeature, 'broadcast')(ctx);

    expect(userFindMany).toHaveBeenCalledWith({ where: { platform: 'tele' } });
    expect(groupFindMany).toHaveBeenCalledWith({ where: { platform: 'tele' } });
    expect(sender).toHaveBeenCalledWith('tele-u', 'hi');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('platform=tele'),
    );
  });

  it('broadcast counts unknown platform rows as failed and skips unregistered adapters', async () => {
    const sender = vi.fn(async () => undefined);
    const adapter = { platform: 'wa', sendMessage: sender };
    const has = vi.fn((platform: string) => platform === 'wa');
    const app = baseApp({
      adapters: { get: vi.fn(() => adapter), has },
      db: {
        user: {
          findMany: vi.fn(async () => [
            { platform: 'wa', externalId: 'wa-u' },
            { platform: 'tele', externalId: 'tele-u' },
            { platform: 'bogus', externalId: 'b-1' },
          ]),
        },
        group: { findMany: vi.fn(async () => []) },
      },
    } as unknown as Partial<AppContext>);
    const ctx = bindApp(createMockCtx({ args: ['hello'] }), app);

    await commandHandler(broadcastFeature, 'broadcast')(ctx);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith('wa-u', 'hello');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('sent=1, failed=2'),
    );
  });
});
