import type { AppContext, Feature, MessageCtx, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import {
  appFromCtx,
  ensureGroup,
  parseToggle,
  type GroupApp,
  type GroupDb,
  upsertGroupConfig,
} from './_shared.js';

const urlPattern = /(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b)/i;

function toggleButtons(current: boolean): ReplyButton[][] {
  return [
    [
      { label: current ? '🔕 Disable' : '🔔 Enable', command: `antilink ${current ? 'off' : 'on'}` },
    ],
  ];
}

async function antiLinkMessage(payload: MessageCtx, app: AppContext): Promise<void> {
  if (!payload.isGroup || !urlPattern.test(payload.text)) return;
  const groupApp = app as GroupApp;

  const db = groupApp.db as GroupDb;
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
          await reply(ctx, 'Usage: /antilink [on|off]');
          return;
        }

        await upsertGroupConfig(app, group.id, { antiLink: next });
        await reply(ctx, `Anti-link ${next ? 'enabled' : 'disabled'}.`, {
          buttons: toggleButtons(next),
        });
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
