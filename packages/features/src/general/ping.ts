import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';

const refreshRow: ReplyButton[][] = [[{ label: '🔄 Refresh', command: 'ping' }]];

const pingFeature: Feature = {
  name: 'ping',
  version: '1.0.0',
  commands: [
    {
      name: 'ping',
      aliases: ['p'],
      description: 'Check bot responsiveness.',
      usage: '/ping',
      async handler(ctx) {
        const latency = Math.max(0, Date.now() - ctx.timestamp);
        await reply(ctx, `pong (latency: ${latency}ms)`, { buttons: refreshRow });
      },
    },
  ],
};

export default pingFeature;