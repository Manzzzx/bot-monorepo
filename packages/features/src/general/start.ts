import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';

const startButtons: ReplyButton[][] = [
  [
    { label: '📋 Menu', command: 'menu' },
    { label: '❓ Help', command: 'help' },
  ],
  [{ label: '🏓 Ping', command: 'ping' }],
];

const startFeature: Feature = {
  name: 'start',
  version: '1.0.0',
  commands: [
    {
      name: 'start',
      description: 'Greet new users and link to help.',
      usage: '/start',
      async handler(ctx) {
        const lines = [
          '👋 Halo! Bot ini siap dipakai.',
          '',
          'Coba: `/help` atau `/menu` untuk lihat command.',
          'Quick test: `/ping`',
        ];
        await reply(ctx, lines.join('\n'), { buttons: startButtons, backTo: false });
      },
    },
  ],
};

export default startFeature;