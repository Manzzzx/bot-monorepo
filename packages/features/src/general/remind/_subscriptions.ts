import type { AppContext, ReminderFirePayload } from '@bot/contracts';
import { parsePlatform } from '@bot/contracts';
import { reminderRepo, type PrismaRepoClient } from '@bot/db';

type ReminderApp = AppContext<PrismaRepoClient>;

type ReminderRow = {
  id: string;
  chatId: string;
  platform: string;
  text: string;
  status?: string;
  attemptCount?: number;
};

const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;

function backoffMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);
}

function idFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string')
    return payload.startsWith('reminder:') ? payload.slice(9) : payload;
  if (typeof payload !== 'object' || payload === null) return null;

  const candidate = payload as { id?: unknown; reminderId?: unknown };
  if (typeof candidate.id === 'string') return candidate.id;
  if (typeof candidate.reminderId === 'string') return candidate.reminderId;
  return null;
}

function isReminderRow(value: unknown): value is ReminderRow {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ReminderRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.chatId === 'string' &&
    typeof candidate.platform === 'string' &&
    typeof candidate.text === 'string'
  );
}

function reminderIdOf(payload: unknown): string | null {
  if (isReminderRow(payload)) return payload.id;
  return idFromPayload(payload);
}

async function loadClaimed(id: string, app: ReminderApp): Promise<ReminderRow | null> {
  const claimed = await reminderRepo.claim(app.db as Parameters<typeof reminderRepo.claim>[0], id);
  if (!claimed) return null;
  return isReminderRow(claimed) ? claimed : null;
}

async function resolveReminder(payload: unknown, app: ReminderApp): Promise<ReminderRow | null> {
  if (isReminderRow(payload) && payload.status === 'firing') return payload;

  const id = idFromPayload(payload);
  if (!id) return null;
  return loadClaimed(id, app);
}

export async function fireReminder(
  payload: ReminderFirePayload | unknown,
  app: AppContext,
): Promise<void> {
  const reminderApp = app as ReminderApp;
  const id = reminderIdOf(payload);
  if (!id) return;

  const reminder = await resolveReminder(payload, reminderApp);
  if (!reminder) {
    reminderApp.logger.info({ reminderId: id }, 'Reminder skip: already claimed');
    return;
  }

  const platform = parsePlatform(reminder.platform);
  if (!platform) {
    reminderApp.logger.warn(
      { reminderId: reminder.id, platform: reminder.platform, status: 'rejected' },
      'Reminder skip: unknown platform',
    );
    await reminderRepo.markFailed(reminderApp.db, reminder.id, new Error('unknown platform'));
    return;
  }

  try {
    await reminderApp.adapters
      .get(platform)
      .sendMessage(reminder.chatId, `⏰ Reminder: ${reminder.text}`);
    await reminderRepo.markDone(reminderApp.db, reminder.id);
  } catch (error) {
    const nextAttempt = (reminder.attemptCount ?? 0) + 1;
    if (nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
      await reminderRepo.markFailed(reminderApp.db, reminder.id, error);
      reminderApp.logger.error(
        { err: error, reminderId: reminder.id, attempt: nextAttempt, status: 'fatal' },
        'Reminder delivery failed permanently',
      );
      return;
    }

    const nextDueAt = new Date(Date.now() + backoffMs(nextAttempt));
    await reminderRepo.incrementAttempt(reminderApp.db, reminder.id, error, nextDueAt);
    reminderApp.logger.warn(
      {
        err: error,
        reminderId: reminder.id,
        attempt: nextAttempt,
        nextDueAt: nextDueAt.toISOString(),
        status: 'recoverable',
      },
      'Reminder delivery failed; scheduled retry with backoff',
    );
  }
}
