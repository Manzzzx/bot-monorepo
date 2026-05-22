import type { Feature } from '@bot/contracts';
import {
  appFromCtx,
  ensureGroup,
  isMessageCtx,
  parseToggle,
  type GroupApp,
  type GroupDb,
  upsertGroupConfig,
} from './_shared.js';

const urlPattern = /(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b)/i;

async function antiLinkMessage(payload: unknown, app: GroupApp): Promise<void> {
  if (!isMessageCtx(payload) || !payload.isGroup || !urlPattern.test(payload.text)) return;

  const db = app.db as GroupDb;
  const group = await db.group.findUnique({
    where: { platform_externalId: { platform: payload.platform, externalId: payload.chatId } },
    include: { config: true },
  });

  if (!group?.config?.antiLink) return;

  if (payload.delete) await payload.delete();
  await payload.reply('Link deleted because anti-link is enabled.', { quote: true });
}

const antiLinkFeature: Feature = {
  name: 'antilink',
  version: '1.0.0',
  commands: [
    {
      name: 'antilink',
      aliases: ['anti-link'],
      description: 'Toggle group anti-link enforcement.',
      usage: '/antilink [on|off]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const group = await ensureGroup(app, ctx);
        const next = parseToggle(ctx.args[0], group.config?.antiLink ?? false);
        if (next === null) {
          await ctx.reply('Usage: /antilink [on|off]');
          return;
        }

        await upsertGroupConfig(app, group.id, { antiLink: next });
        await ctx.reply(`Anti-link ${next ? 'enabled' : 'disabled'}.`);
      },
    },
  ],
  events: [
    {
      event: 'message',
      handler: antiLinkMessage,
    },
  ],
};

export default antiLinkFeature;