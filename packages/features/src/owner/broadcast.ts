import type { Feature, Platform } from '@bot/contracts';
import { appFromCtx } from './_shared.js';

type TargetRow = {
  platform: string;
  externalId: string;
};

type BroadcastDb = {
  user: { findMany(args?: unknown): Promise<TargetRow[]> };
  group: { findMany(args?: unknown): Promise<TargetRow[]> };
};

type BroadcastScope = 'all' | 'users' | 'groups';

function platformOf(value: string): Platform {
  return value === 'tele' ? 'tele' : 'wa';
}

function parseBroadcast(args: string[]): { scope: BroadcastScope; message: string } | null {
  const first = args[0]?.toLowerCase();
  if (first === 'users' || first === 'groups' || first === 'all') {
    const message = args.slice(1).join(' ').trim();
    return message ? { scope: first, message } : null;
  }

  const message = args.join(' ').trim();
  return message ? { scope: 'all', message } : null;
}

function dedupe(rows: TargetRow[]): TargetRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.platform}:${row.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const broadcastFeature: Feature = {
  name: 'broadcast',
  version: '1.0.0',
  commands: [
    {
      name: 'broadcast',
      aliases: ['bc'],
      description: 'Broadcast a message to known users or groups.',
      usage: '/broadcast [users|groups|all] <message>',
      async handler(ctx) {
        const parsed = parseBroadcast(ctx.args);
        if (!parsed) {
          await ctx.reply('Usage: /broadcast [users|groups|all] <message>');
          return;
        }

        const app = appFromCtx<BroadcastDb>(ctx);
        const targets = [
          ...(parsed.scope !== 'groups' ? await app.db.user.findMany() : []),
          ...(parsed.scope !== 'users' ? await app.db.group.findMany() : []),
        ];

        let sent = 0;
        let failed = 0;
        for (const target of dedupe(targets)) {
          try {
            await app.adapters
              .get(platformOf(target.platform))
              .sendMessage(target.externalId, parsed.message);
            sent += 1;
          } catch (error) {
            failed += 1;
            app.logger.error({ err: error, target }, 'Broadcast target failed');
          }
        }

        await ctx.reply(`Broadcast complete: sent=${sent}, failed=${failed}`);
      },
    },
  ],
};

export default broadcastFeature;