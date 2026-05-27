import type { Feature, FeatureCategory, RegisteredCommand, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import {
  appFromCtx,
  canSeeCommand,
  categoryEmoji,
  categoryTitle,
  commandEmoji,
} from './_registry.js';

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';

function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[\]])/g, '\\$1');
}

function isCategory(value: string): value is FeatureCategory {
  return ['general', 'owner', 'group', 'downloader', 'stalker'].includes(value);
}

function buildCommandDetail(entry: RegisteredCommand): string {
  const command = entry.command;
  const aliases = command.aliases?.length
    ? command.aliases.map((alias) => `\`${alias}\``).join(', ')
    : '_tidak ada_';
  const examples = command.examples?.length
    ? command.examples.map((example) => `• \`${example}\``).join('\n')
    : '';
  const lines = [
    `${commandEmoji(command.name)} *${escapeMarkdown(command.name)}*`,
    DIVIDER,
    `📖 ${escapeMarkdown(command.description)}`,
    '',
    `📌 *Cara pakai:* \`${command.usage ?? `/${command.name}`}\``,
    `🏷️ *Kategori:* ${categoryEmoji(entry.category)} ${categoryTitle(entry.category)}`,
    `🔁 *Aliases:* ${aliases}`,
  ];
  if (examples) {
    lines.push('', '✨ *Contoh:*', examples);
  }
  return lines.join('\n');
}

function buildCategoryHelp(
  category: FeatureCategory,
  entries: RegisteredCommand[],
): string {
  const lines = [
    `${categoryEmoji(category)} *${categoryTitle(category).toUpperCase()}*`,
    DIVIDER,
    `${entries.length} command tersedia.`,
    '',
  ];
  for (const entry of entries) {
    lines.push(
      `${commandEmoji(entry.command.name)} \`/${entry.command.name}\` — ${escapeMarkdown(entry.command.description)}`,
    );
  }
  lines.push('');
  lines.push(DIVIDER);
  lines.push('Tip: `/help <command>` untuk detail per perintah.');
  return lines.join('\n');
}

function buildOverview(byCategory: Map<FeatureCategory, RegisteredCommand[]>): string {
  const total = [...byCategory.values()].reduce((sum, list) => sum + list.length, 0);
  const lines = [
    '❓ *BANTUAN*',
    DIVIDER,
    `Bot punya *${total} command* aktif. Pilih kategori atau ketik:`,
    '',
    '• `/help <command>` — detail satu perintah',
    '• `/help <kategori>` — daftar perintah kategori',
    '• `/menu` — papan menu utama',
    '',
  ];
  for (const [category, list] of byCategory) {
    lines.push(
      `${categoryEmoji(category)} *${categoryTitle(category)}* — ${list.length} command`,
    );
  }
  return lines.join('\n');
}

function detailButtons(entry: RegisteredCommand): ReplyButton[][] {
  return [
    [{ label: `▶ Jalankan /${entry.command.name}`, command: entry.command.name }],
    [
      { label: '⬅ Help', command: 'help' },
      { label: '📋 Menu', command: 'menu' },
    ],
  ];
}

function categoryHelpButtons(
  category: FeatureCategory,
  entries: RegisteredCommand[],
): ReplyButton[][] {
  const rows: ReplyButton[][] = [];
  const limited = entries.slice(0, 12);
  for (let i = 0; i < limited.length; i += 2) {
    const a = limited[i];
    const b = limited[i + 1];
    const row: ReplyButton[] = [];
    if (a) row.push({ label: `${commandEmoji(a.command.name)} ${a.command.name}`, command: `help ${a.command.name}` });
    if (b) row.push({ label: `${commandEmoji(b.command.name)} ${b.command.name}`, command: `help ${b.command.name}` });
    rows.push(row);
  }
  rows.push([
    { label: '⬅ Help', command: 'help' },
    { label: `📋 Menu ${categoryTitle(category)}`, command: `menu ${category}` },
  ]);
  return rows;
}

function overviewButtons(
  byCategory: Map<FeatureCategory, RegisteredCommand[]>,
): ReplyButton[][] {
  const cats = [...byCategory.keys()];
  const rows: ReplyButton[][] = [];
  for (let i = 0; i < cats.length; i += 2) {
    const a = cats[i];
    const b = cats[i + 1];
    const row: ReplyButton[] = [];
    if (a) row.push({ label: `${categoryEmoji(a)} ${categoryTitle(a)}`, command: `help ${a}` });
    if (b) row.push({ label: `${categoryEmoji(b)} ${categoryTitle(b)}`, command: `help ${b}` });
    rows.push(row);
  }
  rows.push([{ label: '📋 Menu', command: 'menu' }]);
  return rows;
}

const helpFeature: Feature = {
  name: 'help',
  version: '1.0.0',
  commands: [
    {
      name: 'help',
      aliases: ['h'],
      description: 'Show command help.',
      usage: '/help [command|kategori]',
      examples: ['/help', '/help ping', '/help downloader'],
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const requested = ctx.args[0]?.toLowerCase();

        if (requested) {
          if (isCategory(requested)) {
            const grouped = app.registry.byCategory();
            const list = (grouped[requested] ?? [])
              .filter((entry) => canSeeCommand(entry, ctx, app))
              .sort((a, b) => a.command.name.localeCompare(b.command.name));
            if (list.length === 0) {
              await reply(ctx, `Kategori ${categoryTitle(requested)} kosong.`, {
                backTo: 'help',
              });
              return;
            }
            await reply(ctx, buildCategoryHelp(requested, list), {
              parseMode: 'markdown',
              buttons: categoryHelpButtons(requested, list),
              backTo: false,
            });
            return;
          }

          const entry = app.registry.resolve(requested);
          if (!entry || !canSeeCommand(entry, ctx, app)) {
            await reply(ctx, `❌ Tidak ada perintah \`${escapeMarkdown(requested)}\`.`, {
              parseMode: 'markdown',
              backTo: 'help',
            });
            return;
          }
          await reply(ctx, buildCommandDetail(entry), {
            parseMode: 'markdown',
            buttons: detailButtons(entry),
            backTo: false,
          });
          return;
        }

        const grouped = app.registry.byCategory();
        const order: FeatureCategory[] = ['general', 'downloader', 'stalker', 'group', 'owner'];
        const byCategory = new Map<FeatureCategory, RegisteredCommand[]>();
        for (const category of order) {
          const list = (grouped[category] ?? [])
            .filter((entry) => canSeeCommand(entry, ctx, app))
            .sort((a, b) => a.command.name.localeCompare(b.command.name));
          if (list.length > 0) byCategory.set(category, list);
        }
        if (byCategory.size === 0) {
          await reply(ctx, 'No commands available.');
          return;
        }
        await reply(ctx, buildOverview(byCategory), {
          parseMode: 'markdown',
          buttons: overviewButtons(byCategory),
          backTo: false,
        });
      },
    },
  ],
};

export default helpFeature;