import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx } from './_registry.js';

type DbHealth = {
  $queryRawUnsafe?: (query: string) => Promise<unknown>;
};

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';

const statsButtons: ReplyButton[][] = [
  [
    { label: '🔄 Refresh', command: 'stats' },
    { label: '📋 Menu', command: 'menu' },
  ],
];

function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor((totalSeconds / 3_600) % 24);
  const days = Math.floor(totalSeconds / 86_400);
  const parts = [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    `${seconds}s`,
  ].filter(Boolean);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function dbStatus(db: unknown): Promise<string> {
  const candidate = db as DbHealth;
  if (typeof candidate.$queryRawUnsafe !== 'function') return '⚪ unavailable';
  try {
    await candidate.$queryRawUnsafe('SELECT 1');
    return '🟢 ok';
  } catch {
    return '🔴 error';
  }
}

const statsFeature: Feature = {
  name: 'stats',
  version: '1.0.0',
  commands: [
    {
      name: 'stats',
      aliases: ['status'],
      description: 'Show bot runtime stats.',
      usage: '/stats',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const commands = app.registry.list();
        const featureCount = new Set(commands.map((entry) => entry.feature.name)).size;
        const memory = formatBytes(process.memoryUsage().rss);
        const dbState = await dbStatus(app.db);

        const lines = [
          '📊 *BOT STATS*',
          DIVIDER,
          `⏰ *Uptime:* \`${formatDuration(process.uptime())}\``,
          `💾 *Memory:* \`${memory}\``,
          `⚙️ *Node:* \`${process.version}\``,
          `🧩 *Features:* \`${featureCount}\``,
          `🛠️ *Commands:* \`${commands.length}\``,
          `🗄️ *Database:* ${dbState}`,
          `🌐 *Platform:* \`${ctx.platform}\``,
        ];

        await reply(ctx, lines.join('\n'), {
          parseMode: 'markdown',
          buttons: statsButtons,
          backTo: false,
        });
      },
    },
  ],
};

export default statsFeature;
