import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';

const startButtons: ReplyButton[][] = [
  [
    { label: '📋 Menu', command: 'menu' },
    { label: '❓ Help', command: 'help' },
  ],
  [
    { label: '⬇️ Downloader', command: 'menu downloader' },
    { label: '🔍 Stalker', command: 'menu stalker' },
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
        const greeting = ctx.userName ? `Halo *${ctx.userName}*!` : 'Halo!';
        const lines = [
          `👋 ${greeting}`,
          DIVIDER,
          'Saya bot multi-platform dengan fitur:',
          '',
          '✨ *General* — utility & reminder',
          '⬇️ *Downloader* — TikTok / IG / FB / YT / Spotify',
          '🔍 *Stalker* — IG / TikTok / GitHub / dan banyak lagi',
          '👥 *Group* — moderasi grup',
          '',
          DIVIDER,
          'Mulai cepat:',
          '• Tap tombol di bawah, atau',
          '• Ketik `/menu` untuk papan menu utama',
          '• Ketik `/help <command>` untuk detail',
        ];
        await reply(ctx, lines.join('\n'), {
          parseMode: 'markdown',
          buttons: startButtons,
          backTo: false,
        });
      },
    },
  ],
};

export default startFeature;