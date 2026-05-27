import type { Feature, Platform, ReplyButton } from '@bot/contracts';
import { parsePlatform, reply } from '@bot/contracts';
import { appFromCtx } from './_shared.js';

type TargetRow = {
  platform: string;
  externalId: string;
};

type BroadcastDb = {
  user: {
    findMany(args?: { where?: { platform?: string } }): Promise<TargetRow[]>;
  };
  group: {
    findMany(args?: { where?: { platform?: string } }): Promise<TargetRow[]>;
  };
};

type BroadcastScope = 'all' | 'users' | 'groups';
type PlatformFilter = Platform | 'all';

interface ParsedBroadcast {
  scope: BroadcastScope;
  platform: PlatformFilter;
  message: string;
}

function parseBroadcast(args: string[], flags: Record<string, unknown>): ParsedBroadcast | null {
  const platformFlag = String(flags.platform ?? 'all').toLowerCase();
  const platform: PlatformFilter =
    platformFlag === 'wa' || platformFlag === 'tele' ? platformFlag : 'all';

  const first = args[0]?.toLowerCase();
  if (first === 'users' || first === 'groups' || first === 'all') {
    const message = args.slice(1).join(' ').trim();
    return message ? { scope: first, platform, message } : null;
  }

  const message = args.join(' ').trim();
  return message ? { scope: 'all', platform, message } : null;
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

const followUpButtons: ReplyButton[][] = [
  [
    { label: '📊 Stats', command: 'stats' },
    { label: '📋 Menu', command: 'menu' },
  ],
];

const broadcastFeature: Feature = {
  name: 'broadcast',
  version: '1.0.0',
  commands: [
    {
      name: 'broadcast',
      aliases: ['bc'],
      description: 'Broadcast a message to known users or groups.',
      usage: '/broadcast [users|groups|all] [--platform=wa|tele|all] <message>',
      examples: [
        '/broadcast hi everyone',
        '/broadcast users --platform=tele weekly digest',
        '/broadcast groups --platform=wa downtime notice',
      ],
      async handler(ctx) {
        const parsed = parseBroadcast(ctx.args, ctx.flags);
        if (!parsed) {
          await reply(
            ctx,
            'Usage: /broadcast [users|groups|all] [--platform=wa|tele|all] <message>',
          );
          return;
        }

        const app = appFromCtx<BroadcastDb>(ctx);
        const where = parsed.platform === 'all' ? undefined : { where: { platform: parsed.platform } };
        const targets = [
          ...(parsed.scope !== 'groups' ? await app.db.user.findMany(where) : []),
          ...(parsed.scope !== 'users' ? await app.db.group.findMany(where) : []),
        ];

        let sent = 0;
        let failed = 0;
        for (const target of dedupe(targets)) {
          const platform = parsePlatform(target.platform);
          if (!platform) {
            failed += 1;
            app.logger.warn({ target, status: 'rejected' }, 'Broadcast target has unknown platform');
            continue;
          }
          if (!app.adapters.has(platform)) {
            failed += 1;
            app.logger.warn({ target, platform, status: 'rejected' }, 'Broadcast adapter not registered');
            continue;
          }
          try {
            await app.adapters.get(platform).sendMessage(target.externalId, parsed.message);
            sent += 1;
          } catch (error) {
            failed += 1;
            app.logger.error({ err: error, target, status: 'error' }, 'Broadcast target failed');
          }
        }

        await reply(
          ctx,
          `Broadcast complete: scope=${parsed.scope} platform=${parsed.platform} sent=${sent}, failed=${failed}`,
          { buttons: followUpButtons, backTo: false },
        );
      },
    },
  ],
};

export default broadcastFeature;
