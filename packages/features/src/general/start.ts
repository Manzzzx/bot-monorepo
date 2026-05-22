import type { Feature } from '@bot/contracts';

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
        await ctx.reply(lines.join('\n'));
      },
    },
  ],
};

export default startFeature;
