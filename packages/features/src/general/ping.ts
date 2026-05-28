import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';

const refreshRow: ReplyButton[][] = [
  [
    { label: '🔄 Refresh', command: 'ping' },
    { label: '📊 Stats', command: 'stats' },
  ],
];

function statusIndicator(latencyMs: number): string {
  if (latencyMs < 200) return '🟢 *Sangat cepat*';
  if (latencyMs < 600) return '🟡 *Normal*';
  if (latencyMs < 1500) return '🟠 *Lambat*';
  return '🔴 *Sangat lambat*';
}

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
        const lines = [
          '🏓 *Pong!*',
          `⏱️ Latency: \`${latency} ms\``,
          `📡 Status: ${statusIndicator(latency)}`,
        ];
        await reply(ctx, lines.join('\n'), {
          parseMode: 'markdown',
          buttons: refreshRow,
        });
      },
    },
  ],
};

export default pingFeature;
