import type { AppContext, MessageCtx } from '@bot/contracts';
import { groupRepo, type PrismaRepoClient } from '@bot/db';

export type GroupApp = AppContext<PrismaRepoClient>;
export type GroupBoundCtx = MessageCtx & { app?: GroupApp };

export type GroupConfigRow = {
  groupId: string;
  antiLink: boolean;
  welcomeMsg: string | null;
  muted: boolean;
  mutedUntil?: Date | null;
};

export type GroupRow = {
  id: string;
  platform: string;
  externalId: string;
  config?: GroupConfigRow | null;
};

export type GroupDb = PrismaRepoClient & {
  group: PrismaRepoClient['group'] & {
    findUnique(args: unknown): Promise<GroupRow | null>;
  };
  groupConfig: PrismaRepoClient['groupConfig'] & {
    findUnique(args: unknown): Promise<GroupConfigRow | null>;
    update(args: unknown): Promise<GroupConfigRow>;
    upsert(args: unknown): Promise<GroupConfigRow>;
  };
};

export function appFromCtx(ctx: MessageCtx): GroupApp {
  const app = (ctx as GroupBoundCtx).app;
  if (!app) throw new Error('App context unavailable.');
  return app;
}

export async function ensureGroup(app: GroupApp, ctx: MessageCtx): Promise<GroupRow> {
  return groupRepo.getOrCreate(app.db, ctx.platform, ctx.chatId) as Promise<GroupRow>;
}

export async function upsertGroupConfig(
  app: GroupApp,
  groupId: string,
  data: Partial<Pick<GroupConfigRow, 'antiLink' | 'muted' | 'mutedUntil' | 'welcomeMsg'>>,
): Promise<GroupConfigRow> {
  const db = app.db as GroupDb;
  return db.groupConfig.upsert({
    where: { groupId },
    update: data,
    create: { groupId, ...data },
  });
}

export function parseToggle(value: string | undefined, current: boolean): boolean | null {
  if (!value) return !current;
  const normalized = value.toLowerCase();
  if (['on', 'enable', 'enabled', 'true', 'yes'].includes(normalized)) return true;
  if (['off', 'disable', 'disabled', 'false', 'no'].includes(normalized)) return false;
  if (normalized === 'toggle') return !current;
  return null;
}

export function isMessageCtx(payload: unknown): payload is MessageCtx {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<MessageCtx>;
  return (
    typeof candidate.chatId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.isGroup === 'boolean' &&
    typeof candidate.reply === 'function'
  );
}
