import type { Feature } from '@bot/contracts';

const pingFeature: Feature = {
  name: 'ping',
  version: '1.0.0',
  commands: [
    {
      name: 'ping',
      aliases: ['p'],
      description: 'Check bot responsiveness.',
      usage: '!ping',
      async handler(ctx) {
        const latency = Math.max(0, Date.now() - ctx.timestamp);
        await ctx.reply(`pong (latency: ${latency}ms)`);
      },
    },
  ],
};

export default pingFeature;
