import type { Feature } from '@bot/contracts';
import { appFromCtx, ensureGroup, parseToggle, upsertGroupConfig } from './_shared.js';

const muteFeature: Feature = {
  name: 'mute',
  version: '1.0.0',
  commands: [
    {
      name: 'mute',
      aliases: ['mutegroup'],
      description: 'Toggle group muted state.',
      usage: '!mute [on|off]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const group = await ensureGroup(app, ctx);
        const next = parseToggle(ctx.args[0], group.config?.muted ?? false);
        if (next === null) {
          await ctx.reply('Usage: !mute [on|off]');
          return;
        }

        await upsertGroupConfig(app, group.id, { muted: next, mutedUntil: null });
        await ctx.reply(`Group mute ${next ? 'enabled' : 'disabled'}.`);
      },
    },
  ],
};

export default muteFeature;
