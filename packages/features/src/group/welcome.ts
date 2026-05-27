import type { AppContext, Feature, GroupJoinPayload, ReplyButton } from '@bot/contracts';
import { parsePlatform } from '@bot/contracts';
import { reply } from '@bot/contracts';
import {
  appFromCtx,
  ensureGroup,
  type GroupApp,
  type GroupDb,
  upsertGroupConfig,
} from './_shared.js';

type JoinUser = {
  id: string;
  name?: string;
};

type JoinPayload = {
  platform?: unknown;
  chatId?: unknown;
  groupId?: unknown;
  groupName?: unknown;
  userId?: unknown;
  userName?: unknown;
  users?: unknown;
};



function makeUser(id: string, name?: unknown): JoinUser {
  return typeof name === 'string' ? { id, name } : { id };
}

function joinUsers(payload: JoinPayload): JoinUser[] {
  if (Array.isArray(payload.users)) {
    return payload.users
      .map((user) => {
        if (typeof user === 'string') return makeUser(user);
        if (typeof user !== 'object' || user === null) return null;
        const candidate = user as Partial<JoinUser>;
        return typeof candidate.id === 'string' ? makeUser(candidate.id, candidate.name) : null;
      })
      .filter((user): user is JoinUser => user !== null);
  }

  return typeof payload.userId === 'string' ? [makeUser(payload.userId, payload.userName)] : [];
}

function renderWelcome(template: string, user: JoinUser, groupName: string): string {
  return template.replaceAll('{user}', user.name ?? user.id).replaceAll('{group}', groupName);
}

async function sendWelcome(payload: GroupJoinPayload, app: AppContext): Promise<void> {
  const groupApp = app as GroupApp;
  

  const event = payload as JoinPayload;
  const platform = parsePlatform(event.platform);
  const chatId = typeof event.chatId === 'string' ? event.chatId : event.groupId;
  if (!platform || typeof chatId !== 'string') return;

  const db = groupApp.db as GroupDb;
  const group = await db.group.findUnique({
    where: { platform_externalId: { platform, externalId: chatId } },
    include: { config: true },
  });
  const template = group?.config?.welcomeMsg;
  if (!template) return;

  const groupName = typeof event.groupName === 'string' ? event.groupName : chatId;
  const adapter = groupApp.adapters.get(platform);
  for (const user of joinUsers(event)) {
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