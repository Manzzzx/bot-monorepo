import type { AppContext, Platform } from '@bot/contracts';
import { reminderRepo, type PrismaRepoClient } from '@bot/db';

type ReminderApp = AppContext<PrismaRepoClient>;

type ReminderRow = {
  id: string;
  chatId: string;
  platform: string;
  text: string;
  status?: string;
};

type ReminderPayload = {
  id?: unknown;
  reminderId?: unknown;
};

function platformOf(value: string): Platform {
  return value === 'tele' ? 'tele' : 'wa';
}

function idFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string')
    return payload.startsWith('reminder:') ? payload.slice(9) : payload;
  if (typeof payload !== 'object' || payload === null) return null;

  const candidate = payload as ReminderPayload;
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

export async function fireReminder(payload: unknown, app: AppContext): Promise<void> {
  const reminderApp = app as ReminderApp;
  const id = reminderIdOf(payload);
  if (!id) return;

  const reminder = await resolveReminder(payload, reminderApp);
  if (!reminder) {
    reminderApp.logger.info({ reminderId: id }, 'Reminder skip: already claimed');
    return;
  }

  try {
    await reminderApp.adapters
      .get(platformOf(reminder.platform))
      .sendMessage(reminder.chatId, `⏰ Reminder: ${reminder.text}`);
    await reminderRepo.markDone(reminderApp.db, reminder.id);
  } catch (error) {
    await reminderRepo.markFailed(reminderApp.db, reminder.id, error);
    reminderApp.logger.error({ err: error, reminderId: reminder.id }, 'Reminder delivery failed');
  }
}
