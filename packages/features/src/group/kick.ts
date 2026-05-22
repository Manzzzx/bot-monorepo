import type { Feature } from '@bot/contracts';
import { appFromCtx } from './_shared.js';

type KickAdapter = {
  kickMember?(chatId: string, userId: string): Promise<void>;
  removeMember?(chatId: string, userId: string): Promise<void>;
};

function targetFromArgs(args: string[]): string | null {
  const target = args[0]?.trim();
  if (!target) return null;
  return target.replace(/^@/, '');
}

const kickFeature: Feature = {
  name: 'kick',
  version: '1.0.0',
  commands: [
    {
      name: 'kick',
      aliases: ['remove'],
      description: 'Kick a group member when the platform adapter supports it.',
      usage: '!kick <userId>',
      async handler(ctx) {
        const target = targetFromArgs(ctx.args);
        if (!target) {
          await ctx.reply('Usage: !kick <userId>');
          return;
        }

        const app = appFromCtx(ctx);
        const adapter = app.adapters.get(ctx.platform) as KickAdapter;
        const kick = adapter.kickMember ?? adapter.removeMember;
        if (!kick) {
          await ctx.reply('Kick unsupported or bot lacks admin permission.');
          return;
        }

        try {
          await kick.call(adapter, ctx.chatId, target);
          await ctx.reply(`Kicked ${target}.`);
        } catch {
          await ctx.reply('Kick failed: unsupported or admin permission required.');
        }
      },
    },
  ],
};

export default kickFeature;
