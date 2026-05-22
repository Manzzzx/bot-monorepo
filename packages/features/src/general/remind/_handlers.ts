import type { AppContext, MessageCtx, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { userRepo, type PrismaRepoClient } from '@bot/db';

type ReminderApp = AppContext<PrismaRepoClient>;
type AppBoundMessageCtx = MessageCtx & { app?: ReminderApp };

type DurationUnit = 's' | 'm' | 'h' | 'd';

const unitMs: Record<DurationUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function appFromCtx(ctx: MessageCtx): ReminderApp {
  const app = (ctx as AppBoundMessageCtx).app;
  if (!app) throw new Error('App context unavailable.');
  return app;
}

function parseDuration(raw: string | undefined): number | null {
  const match = raw?.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() as DurationUnit;
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return amount * unitMs[unit];
}

function parseReminderArgs(args: string[]): { delayMs: number; text: string } | null {
  const normalized = args[0]?.toLowerCase() === 'in' ? args.slice(1) : args;
  const delayMs = parseDuration(normalized[0]);
  const text = normalized.slice(1).join(' ').trim();
  if (!delayMs || !text) return null;
  return { delayMs, text };
}

function formatDueAt(date: Date): string {
  return date.toISOString();
}

export async function createReminder(ctx: MessageCtx): Promise<void> {
  const parsed = parseReminderArgs(ctx.args);
  if (!parsed) {
    await reply(ctx, 'Usage: /remind 10m drink water', {
      buttons: [[{ label: '📋 My reminders', command: 'reminders' }]],
    });
    return;
  }

  const app = appFromCtx(ctx);
  const user = await userRepo.upsertByExternal(app.db, ctx.platform, ctx.userId);
  const dueAt = new Date(Date.now() + parsed.delayMs);
  const reminder = await app.db.reminder.create({
    data: {
      userId: user.id,
      chatId: ctx.chatId,
      platform: ctx.platform,
      text: parsed.text,
      dueAt,
    },
  });

  await app.scheduler.scheduleOnce(dueAt, `reminder:${reminder.id}`, { id: reminder.id });

  const buttons: ReplyButton[][] = [
    [
      { label: '📋 List', command: 'reminders' },
      { label: '✖ Cancel', command: `cancelreminder ${reminder.id}` },
    ],
  ];
  await reply(
    ctx,
    `Reminder set (${reminder.id}) for ${formatDueAt(dueAt)}: ${parsed.text}`,
    { buttons },
  );
}

export async function listReminders(ctx: MessageCtx): Promise<void> {
  const app = appFromCtx(ctx);
  const user = await app.db.user.findUnique({
    where: { platform_externalId: { platform: ctx.platform, externalId: ctx.userId } },
  });

  if (!user) {
    await reply(ctx, 'No pending reminders.');
    return;
  }

  const reminders = await app.db.reminder.findMany({
    where: { userId: user.id, status: 'pending' },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: 10,
  });

  if (reminders.length === 0) {
    await reply(ctx, 'No pending reminders.');
    return;
  }

  const buttons: ReplyButton[][] = reminders.slice(0, 5).map((reminder) => [
    {
      label: `✖ Cancel ${reminder.id.slice(-6)}`,
      command: `cancelreminder ${reminder.id}`,
    },
  ]);

  await reply(
    ctx,
    [
      'Pending reminders:',
      ...reminders.map(
        (reminder) => `- ${reminder.id} at ${formatDueAt(reminder.dueAt)}: ${reminder.text}`,
      ),
    ].join('\n'),
    { buttons },
  );
}

export async function cancelReminder(ctx: MessageCtx): Promise<void> {
  const reminderId = ctx.args[0];
  if (!reminderId) {
    await reply(ctx, 'Usage: /cancelreminder <id>');
    return;
  }

  const app = appFromCtx(ctx);
  const user = await app.db.user.findUnique({
    where: { platform_externalId: { platform: ctx.platform, externalId: ctx.userId } },
  });

  if (!user) {
    await reply(ctx, `Reminder not found: ${reminderId}`, { backTo: 'reminders' });
    return;
  }

  const result = await app.db.reminder.deleteMany({
    where: { id: reminderId, userId: user.id, status: 'pending' },
  });

  if (result.count === 0) {
    await reply(ctx, `Reminder not found: ${reminderId}`, { backTo: 'reminders' });
    return;
  }

  await reply(ctx, `Reminder canceled: ${reminderId}`, {
    buttons: [[{ label: '📋 List', command: 'reminders' }]],
  });
}