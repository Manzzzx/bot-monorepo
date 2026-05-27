import type { AppContext, FeatureCategory, MessageCtx, RegisteredCommand } from '@bot/contracts';

export type AppBoundMessageCtx<TDb = unknown> = MessageCtx & { app?: AppContext<TDb> };

export function appFromCtx<TDb = unknown>(ctx: MessageCtx): AppContext<TDb> {
  const app = (ctx as AppBoundMessageCtx<TDb>).app;
  if (!app) throw new Error('App context unavailable.');
  return app;
}

export function isOwner(ctx: MessageCtx, app: Pick<AppContext, 'config'>): boolean {
  const ownerId = ctx.platform === 'wa' ? app.config.OWNER_WA : app.config.OWNER_TG;
  return Boolean(ownerId && ownerId === ctx.userId);
}

export function categoryTitle(category: FeatureCategory): string {
  if (category === 'general') return 'General';
  if (category === 'owner') return 'Owner';
  if (category === 'group') return 'Group';
  if (category === 'downloader') return 'Downloader';
  if (category === 'stalker') return 'Stalker';
  return category;
}

export function canSeeCommand(
  entry: RegisteredCommand,
  ctx: MessageCtx,
  app: Pick<AppContext, 'config'>,
): boolean {
  if (entry.category === 'owner' && !isOwner(ctx, app)) return false;
  if (entry.category === 'group' && !ctx.isGroup) return false;
  return true;
}

export function visibleCommands(
  ctx: MessageCtx,
  app: Pick<AppContext, 'config' | 'registry'>,
): RegisteredCommand[] {
  return app.registry
    .list()
    .filter((entry) => canSeeCommand(entry, ctx, app))
    .sort((left, right) => left.command.name.localeCompare(right.command.name));
}