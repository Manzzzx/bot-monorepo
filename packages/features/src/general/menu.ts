import type { Feature, FeatureCategory, RegisteredCommand, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import {
  appFromCtx,
  canSeeCommand,
  categoryEmoji,
  categoryTitle,
  commandEmoji,
} from './_registry.js';

const CATEGORY_ORDER: FeatureCategory[] = [
  'general',
  'downloader',
  'stalker',
  'group',
  'owner',
];

const CATEGORY_ALIASES: Record<string, FeatureCategory> = {
  general: 'general',
  ['umum']: 'general',
  downloader: 'downloader',
  ['dl']: 'downloader',
  stalker: 'stalker',
  ['stalk']: 'stalker',
  group: 'group',
  ['grup']: 'group',
  owner: 'owner',
};

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';

function entriesByCategory(
  app: ReturnType<typeof appFromCtx>,
  ctx: Parameters<typeof canSeeCommand>[1],
): Map<FeatureCategory, RegisteredCommand[]> {
  const grouped = app.registry.byCategory();
  const result = new Map<FeatureCategory, RegisteredCommand[]>();
  for (const category of CATEGORY_ORDER) {
    const list = (grouped[category] ?? [])
      .filter((entry) => canSeeCommand(entry, ctx, app))
      .sort((a, b) => a.command.name.localeCompare(b.command.name));
    if (list.length > 0) result.set(category, list);
  }
  return result;
}

function buildOverview(byCategory: Map<FeatureCategory, RegisteredCommand[]>): string {
  const total = [...byCategory.values()].reduce((sum, list) => sum + list.length, 0);
  const lines = [
    '📋 *MENU UTAMA*',
    DIVIDER,
    `Total ${total} command tersedia.`,
    'Pilih kategori di bawah atau ketik `/menu <kategori>`.',
    '',
  ];
  for (const [category, list] of byCategory) {
    const count = list.length.toString().padStart(2, ' ');
    lines.push(`${categoryEmoji(category)} *${categoryTitle(category)}* — ${count} command`);
  }
  lines.push('');
  lines.push(DIVIDER);
  lines.push('Tap kategori untuk lihat detail.');
  return lines.join('\n');
}

function buildCategoryView(
  category: FeatureCategory,
  list: RegisteredCommand[],
): string {
  const lines = [
    `${categoryEmoji(category)} *${categoryTitle(category).toUpperCase()}*`,
    DIVIDER,
    `${list.length} command tersedia.`,
    '',
  ];
  for (const entry of list) {
    const aliases = entry.command.aliases?.length
      ? ` _( ${entry.command.aliases.join(', ')} )_`
      : '';
    lines.push(
      `${commandEmoji(entry.command.name)} \`/${entry.command.name}\`${aliases}`,
    );
    if (entry.command.description) {
      lines.push(`   ${entry.command.description}`);
    }
  }
  lines.push('');
  lines.push(DIVIDER);
  lines.push('Tip: `/help <command>` untuk detail.');
  return lines.join('\n');
}

function categoryButtons(
  byCategory: Map<FeatureCategory, RegisteredCommand[]>,
): ReplyButton[][] {
  const cats = [...byCategory.keys()];
  const rows: ReplyButton[][] = [];
  for (let i = 0; i < cats.length; i += 2) {
    const a = cats[i];
    const b = cats[i + 1];
    const row: ReplyButton[] = [];
    if (a) {
      row.push({
        label: `${categoryEmoji(a)} ${categoryTitle(a)}`,
        command: `menu ${a}`,
      });
    }
    if (b) {
      row.push({
        label: `${categoryEmoji(b)} ${categoryTitle(b)}`,
        command: `menu ${b}`,
      });
    }
    rows.push(row);
  }
  rows.push([
    { label: '❓ Help', command: 'help' },
    { label: '🏓 Ping', command: 'ping' },
  ]);
  return rows;
}

function commandButtons(
  list: RegisteredCommand[],
  category: FeatureCategory,
): ReplyButton[][] {
  const rows: ReplyButton[][] = [];
  const limited = list.slice(0, 14);
  for (let i = 0; i < limited.length; i += 2) {
    const a = limited[i];
    const b = limited[i + 1];
    const row: ReplyButton[] = [];
    if (a) row.push({ label: `${commandEmoji(a.command.name)} ${a.command.name}`, command: a.command.name });
    if (b) row.push({ label: `${commandEmoji(b.command.name)} ${b.command.name}`, command: b.command.name });
    rows.push(row);
  }
  rows.push([
    { label: '⬅ Menu', command: 'menu' },
    { label: '❓ Help', command: `help ${category}` },
  ]);
  return rows;
}

const menuFeature: Feature = {
  name: 'menu',
  version: '1.0.0',
  commands: [
    {
      name: 'menu',
      aliases: ['commands'],
      description: 'Show available commands.',
      usage: '/menu [category]',
      examples: ['/menu', '/menu downloader', '/menu stalker'],
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const byCategory = entriesByCategory(app, ctx);
        if (byCategory.size === 0) {
          await reply(ctx, 'No commands available.', { backTo: false });
          return;
        }

        const requested = ctx.args[0]?.toLowerCase();
        if (requested && CATEGORY_ALIASES[requested]) {
          const target = CATEGORY_ALIASES[requested];
          const list = byCategory.get(target);
          if (!list) {
            await reply(ctx, `Kategori ${categoryTitle(target)} kosong.`, { backTo: 'menu' });
            return;
          }
          await reply(ctx, buildCategoryView(target, list), {
            parseMode: 'markdown',
            buttons: commandButtons(list, target),
            backTo: false,
          });
          return;
        }

        await reply(ctx, buildOverview(byCategory), {
          parseMode: 'markdown',
          buttons: categoryButtons(byCategory),
          backTo: false,
        });
      },
    },
  ],
};

export default menuFeature;