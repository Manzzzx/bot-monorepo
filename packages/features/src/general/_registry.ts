import type { AppContext, FeatureCategory, MessageCtx, RegisteredCommand } from '@bot/contracts';
import { appFromCtx as coreAppFromCtx } from '@bot/core';

export type AppBoundMessageCtx<TDb = unknown> = MessageCtx & { app?: AppContext<TDb> };

export function appFromCtx<TDb = unknown>(ctx: MessageCtx): AppContext<TDb> {
  return coreAppFromCtx<TDb>(ctx);
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

export function categoryEmoji(category: FeatureCategory): string {
  if (category === 'general') return '✨';
  if (category === 'owner') return '👑';
  if (category === 'group') return '👥';
  if (category === 'downloader') return '⬇️';
  if (category === 'stalker') return '🔍';
  return '📋';
}

const commandEmojiMap: Record<string, string> = {
  ping: '🏓',
  help: '❓',
  menu: '📋',
  start: '🚀',
  stats: '📊',
  remind: '⏰',
  reminders: '📅',
  cancelreminder: '🗑️',
  kick: '🚪',
  mute: '🔇',
  antilink: '🔗',
  welcome: '👋',
  eval: '⚙️',
  broadcast: '📢',
  shutdown: '🛑',
  tiktok: '🎬',
  igdl: '📷',
  fbdl: '📘',
  twitter: '🐦',
  ytmp3: '🎵',
  ytmp4: '📺',
  spotify: '🎧',
  pinterest: '📌',
  sfile: '📁',
  igstalk: '📷',
  ttstalk: '🎬',
  ghstalk: '💻',
  twitterstalk: '🐦',
  threadsstalk: '🧵',
  pinstalk: '📌',
  ytstalk: '📺',
  robloxstalk: '🟥',
  fbstalk: '📘',
  ffstalk: '🔥',
  mlstalk: '⚔️',
  pixivstalk: '🎨',
  wastalk: '💬',
};

export function commandEmoji(name: string): string {
  return commandEmojiMap[name] ?? '•';
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
const MARKDOWN_ESCAPE = /([_*[\]()~>#+\-=|{}.!\\])/g;

/**
 * Escape Telegram legacy Markdown specials in untrusted content.
 * Use BEFORE injecting any user-supplied or dynamic value into a
 * markdown-rendered reply (parseMode: 'markdown').
 */
export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE, '\\$1');
}
