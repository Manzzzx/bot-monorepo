import type { Feature } from '@bot/contracts';
import { appFromCtx } from './_shared.js';

const shutdownFeature: Feature = {
  name: 'shutdown',
  version: '1.0.0',
  commands: [
    {
      name: 'shutdown',
      aliases: ['poweroff'],
      description: 'Request a graceful bot shutdown.',
      usage: '!shutdown [reason]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const reason = ctx.args.join(' ').trim() || 'owner requested shutdown';
        if (typeof app.shutdown !== 'function') {
          await ctx.reply('Shutdown hook unavailable.');
          return;
        }

        await ctx.reply('Shutdown requested.');
        await app.shutdown(reason);
      },
    },
  ],
};

export default shutdownFeature;
