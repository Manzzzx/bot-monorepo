import type { AppContext, MessageCtx } from '@bot/contracts';
import { createMockCtx } from '@bot/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import remindFeature from './general/remind/index.js';

vi.mock('@bot/db', () => ({
  userRepo: {
    upsertByExternal: vi.fn(async () => ({ id: 'user-db-1' })),
    findByExternal: vi.fn(async () => ({ id: 'user-db-1' })),
  },
  reminderRepo: {
    claim: vi.fn(async () => null),
    markDone: vi.fn(async () => ({})),
    markFailed: vi.fn(async () => ({})),
    incrementAttempt: vi.fn(async () => ({})),
  },
}));

const dbModule = await import('@bot/db');
const userRepoMock = dbModule.userRepo as unknown as {
  upsertByExternal: ReturnType<typeof vi.fn>;
  findByExternal: ReturnType<typeof vi.fn>;
};
const reminderRepoMock = dbModule.reminderRepo as unknown as {
  claim: ReturnType<typeof vi.fn>;
  markDone: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  incrementAttempt: ReturnType<typeof vi.fn>;
};

type ReminderState = {
  rows: Map<
    string,
    {
      id: string;
      userId: string;
      status: string;
      chatId: string;
      platform: string;
      text: string;
      dueAt: Date;
    }
  >;
};

function createDb(state: ReminderState) {
  return {
    user: {
      findUnique: vi.fn(async () => ({ id: 'user-db-1' })),
    },
    reminder: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; chatId: string; platform: string; text: string; dueAt: Date };
        }) => {
          const id = `rem-${state.rows.size + 1}`;
          const row = {
            id,
            userId: data.userId,
            chatId: data.chatId,
            platform: data.platform,
            text: data.text,
            dueAt: data.dueAt,
            status: 'pending',
          };
          state.rows.set(id, row);
          return row;
        },
      ),
      findMany: vi.fn(async ({ where }: { where: { userId: string; status: string } }) =>
        [...state.rows.values()].filter(
          (row) => row.userId === where.userId && row.status === where.status,
        ),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        const row = state.rows.get(where.id);
        if (!row || row.userId !== where.userId || row.status !== 'pending') return { count: 0 };
        state.rows.delete(where.id);
        return { count: 1 };
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => state.rows.get(where.id) ?? null,
      ),
    },
  };
}

function createApp(
  state: ReminderState,
  sender = vi.fn(async () => undefined),
): AppContext & { __sender: ReturnType<typeof vi.fn> } {
  return {
    config: { OWNER_WA: 'owner-wa', OWNER_TG: 'owner-tg' },
    logger: { error: vi.fn(), info: vi.fn() },
    db: createDb(state),
    bus: { emit: vi.fn(), on: vi.fn() },
    scheduler: { start: vi.fn(), stop: vi.fn(), scheduleOnce: vi.fn(async () => undefined) },
    rateLimit: { outbound: vi.fn() },
    registry: { register: vi.fn(), resolve: vi.fn(), list: vi.fn(() => []), byCategory: vi.fn() },
    adapters: {
      get: vi.fn(() => ({ platform: 'wa', sendMessage: sender })),
      has: vi.fn(() => true),
    },
    __sender: sender,
  } as unknown as AppContext & { __sender: ReturnType<typeof vi.fn> };
}

function bindApp(ctx: MessageCtx, app: AppContext): MessageCtx {
  return Object.assign(ctx, { app });
}

function commandHandler(name: string) {
  const found = remindFeature.commands?.find((cmd) => cmd.name === name);
  if (!found) throw new Error(`missing command ${name}`);
  return found.handler;
}

afterEach(() => {
  userRepoMock.upsertByExternal.mockClear();
  reminderRepoMock.claim.mockReset();
  reminderRepoMock.claim.mockImplementation(async () => null);
  reminderRepoMock.markDone.mockClear();
  reminderRepoMock.markFailed.mockClear();
});

describe('remind feature', () => {
  it('creates a reminder and schedules it', async () => {
    const state: ReminderState = { rows: new Map() };
    const app = createApp(state);
    const ctx = bindApp(
      createMockCtx({ args: ['10m', 'drink', 'water'], userId: 'user-1', chatId: 'chat-1' }),
      app,
    );

    await commandHandler('remind')(ctx);

    expect(state.rows.size).toBe(1);
    expect(app.scheduler.scheduleOnce).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('drink water'));
  });

  it('lists pending reminders for the user', async () => {
    const state: ReminderState = {
      rows: new Map([
        [
          'rem-1',
          {
            id: 'rem-1',
            userId: 'user-db-1',
            status: 'pending',
            chatId: 'chat-1',
            platform: 'wa',
            text: 'one',
            dueAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      ]),
    };
    const app = createApp(state);
    const ctx = bindApp(createMockCtx({ userId: 'user-1' }), app);

    await commandHandler('reminders')(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('rem-1'));
  });

  it('cancels only the user own reminder', async () => {
    const state: ReminderState = {
      rows: new Map([
        [
          'rem-1',
          {
            id: 'rem-1',
            userId: 'user-db-1',
            status: 'pending',
            chatId: 'chat-1',
            platform: 'wa',
            text: 'mine',
            dueAt: new Date(),
          },
        ],
      ]),
    };
    const app = createApp(state);
    const ctx = bindApp(createMockCtx({ userId: 'user-1', args: ['rem-1'] }), app);

    await commandHandler('cancelreminder')(ctx);

    expect(state.rows.size).toBe(0);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('canceled'));
  });

  it('does not cancel other user reminders', async () => {
    const state: ReminderState = {
      rows: new Map([
        [
          'rem-9',
          {
            id: 'rem-9',
            userId: 'someone-else',
            status: 'pending',
            chatId: 'chat-1',
            platform: 'wa',
            text: 'theirs',
            dueAt: new Date(),
          },
        ],
      ]),
    };
    const app = createApp(state);
    const ctx = bindApp(createMockCtx({ userId: 'user-1', args: ['rem-9'] }), app);

    await commandHandler('cancelreminder')(ctx);

    expect(state.rows.size).toBe(1);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('fires a reminder via adapter and marks done', async () => {
    const state: ReminderState = {
      rows: new Map([
        [
          'rem-1',
          {
            id: 'rem-1',
            userId: 'user-db-1',
            status: 'pending',
            chatId: 'chat-1',
            platform: 'wa',
            text: 'fire me',
            dueAt: new Date(),
          },
        ],
      ]),
    };
    const sender = vi.fn(async () => undefined);
    const app = createApp(state, sender);
    reminderRepoMock.claim.mockResolvedValueOnce({
      id: 'rem-1',
      chatId: 'chat-1',
      platform: 'wa',
      text: 'fire me',
    });

    const subscription = remindFeature.events?.find((event) => event.event === 'reminder.fire');
    if (!subscription) throw new Error('missing reminder.fire subscription');

    await subscription.handler({ id: 'rem-1' }, app);

    expect(reminderRepoMock.claim).toHaveBeenCalledWith(app.db, 'rem-1');
    expect(sender).toHaveBeenCalledWith('chat-1', expect.stringContaining('fire me'));
    expect(reminderRepoMock.markDone).toHaveBeenCalledWith(app.db, 'rem-1');
  });

  it('fires a pre-claimed scheduler reminder without reclaiming it', async () => {
    const state: ReminderState = { rows: new Map() };
    const sender = vi.fn(async () => undefined);
    const app = createApp(state, sender);

    const subscription = remindFeature.events?.find((event) => event.event === 'reminder.fire');
    if (!subscription) throw new Error('missing reminder.fire subscription');

    await subscription.handler(
      {
        id: 'rem-claimed',
        chatId: 'chat-1',
        platform: 'wa',
        text: 'from cron',
        status: 'firing',
      },
      app,
    );

    expect(reminderRepoMock.claim).not.toHaveBeenCalled();
    expect(sender).toHaveBeenCalledWith('chat-1', expect.stringContaining('from cron'));
    expect(reminderRepoMock.markDone).toHaveBeenCalledWith(app.db, 'rem-claimed');
  });

  it('skips delivery when claim returns null (already fired)', async () => {
    const state: ReminderState = { rows: new Map() };
    const sender = vi.fn(async () => undefined);
    const app = createApp(state, sender);
    reminderRepoMock.claim.mockResolvedValueOnce(null);

    const subscription = remindFeature.events?.find((event) => event.event === 'reminder.fire');
    if (!subscription) throw new Error('missing reminder.fire subscription');

    await subscription.handler({ id: 'rem-1' }, app);

    expect(reminderRepoMock.claim).toHaveBeenCalledWith(app.db, 'rem-1');
    expect(sender).not.toHaveBeenCalled();
    expect(reminderRepoMock.markDone).not.toHaveBeenCalled();
    expect(reminderRepoMock.markFailed).not.toHaveBeenCalled();
  });

  it('delivers only once when fired in parallel (CAS guard)', async () => {
    const state: ReminderState = { rows: new Map() };
    const sender = vi.fn(async () => undefined);
    const app = createApp(state, sender);

    let claimed = false;
    reminderRepoMock.claim.mockImplementation(async (_db: unknown, id: string) => {
      if (claimed) return null;
      claimed = true;
      return { id, chatId: 'chat-1', platform: 'wa', text: 'race me' };
    });

    const subscription = remindFeature.events?.find((event) => event.event === 'reminder.fire');
    if (!subscription) throw new Error('missing reminder.fire subscription');

    await Promise.all([
      subscription.handler({ id: 'rem-race' }, app),
      subscription.handler({ id: 'rem-race' }, app),
    ]);

    expect(reminderRepoMock.claim).toHaveBeenCalledTimes(2);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(reminderRepoMock.markDone).toHaveBeenCalledTimes(1);
  });
});
