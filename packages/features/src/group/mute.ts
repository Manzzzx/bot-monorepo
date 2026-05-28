import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx, ensureGroup, parseToggle, upsertGroupConfig } from './_shared.js';

function toggleButtons(current: boolean): ReplyButton[][] {
  return [
    [{ label: current ? '🔊 Unmute' : '🔇 Mute', command: `mute ${current ? 'off' : 'on'}` }],
  ];
}

const muteFeature: Feature = {
  name: 'mute',
  version: '1.0.0',
  commands: [
    {
      name: 'mute',
      aliases: ['mutegroup'],
      description: 'Toggle group muted state.',
      usage: '/mute [on|off]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const group = await ensureGroup(app, ctx);
        const next = parseToggle(ctx.args[0], group.config?.muted ?? false);
        if (next === null) {
          await reply(ctx, 'Usage: /mute [on|off]');
          return;
        }

        await upsertGroupConfig(app, group.id, { muted: next, mutedUntil: null });
        await reply(ctx, `Group mute ${next ? 'enabled' : 'disabled'}.`, {
          buttons: toggleButtons(next),
        });
      },
    },
  ],
};

export default muteFeature;
