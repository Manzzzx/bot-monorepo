import type {
  AppContext,
  Feature,
  GroupJoinPayload,
  GroupJoinUser,
  ReplyButton,
} from '@bot/contracts';
import { reply } from '@bot/contracts';
import {
  appFromCtx,
  ensureGroup,
  type GroupApp,
  type GroupDb,
  upsertGroupConfig,
} from './_shared.js';

function joinUsers(payload: GroupJoinPayload): GroupJoinUser[] {
  if (payload.users && payload.users.length > 0) return payload.users;
  if (payload.userId) {
    const user: GroupJoinUser = payload.userName
      ? { id: payload.userId, name: payload.userName }
      : { id: payload.userId };
    return [user];
  }
  return [];
}

function renderWelcome(template: string, user: GroupJoinUser, groupName: string): string {
  return template.replaceAll('{user}', user.name ?? user.id).replaceAll('{group}', groupName);
}

async function sendWelcome(payload: GroupJoinPayload, app: AppContext): Promise<void> {
  const groupApp = app as GroupApp;
  const chatId = payload.chatId || payload.groupId;
  if (!chatId) return;

  const db = groupApp.db as GroupDb;
  const group = await db.group.findUnique({
    where: { platform_externalId: { platform: payload.platform, externalId: chatId } },
    include: { config: true },
  });
  const template = group?.config?.welcomeMsg;
  if (!template) return;

  const groupName = payload.groupName ?? chatId;
  const adapter = groupApp.adapters.get(payload.platform);
  for (const user of joinUsers(payload)) {
    await adapter.sendMessage(chatId, renderWelcome(template, user, groupName));
  }
}

const disableButton: ReplyButton[][] = [[{ label: '✖ Disable welcome', command: 'welcome off' }]];

const welcomeFeature: Feature = {
  name: 'welcome',
  version: '1.0.0',
  commands: [
    {
      name: 'welcome',
      aliases: ['setwelcome'],
      description: 'Set or disable a group welcome message.',
      usage: '/welcome <message|off>',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const group = await ensureGroup(app, ctx);
        const text = ctx.args.join(' ').trim();
        if (!text) {
          await reply(ctx, 'Usage: /welcome <message|off>');
          return;
        }

        if (text.toLowerCase() === 'off') {
          await upsertGroupConfig(app, group.id, { welcomeMsg: null });
          await reply(ctx, 'Welcome disabled.');
          return;
        }

        await upsertGroupConfig(app, group.id, { welcomeMsg: text });
        await reply(ctx, 'Welcome message updated.', { buttons: disableButton });
      },
    },
  ],
  events: [
    {
      event: 'group.join',
      handler: sendWelcome,
    },
  ],
};

export default welcomeFeature;
