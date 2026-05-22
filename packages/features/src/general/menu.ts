import type { Feature, FeatureCategory, RegisteredCommand, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx, canSeeCommand, categoryTitle } from './_registry.js';

const categoryOrder: FeatureCategory[] = ['general', 'owner', 'group'];
const MAX_BUTTON_ROWS = 8;

function commandLine(entry: RegisteredCommand): string {
  const aliases = entry.command.aliases?.length ? ` (${entry.command.aliases.join(', ')})` : '';
  return `- /${entry.command.name}${aliases}: ${entry.command.description}`;
}

function buildMenuButtons(entries: RegisteredCommand[]): ReplyButton[][] {
  const rows: ReplyButton[][] = [];
  for (let i = 0; i < entries.length && rows.length < MAX_BUTTON_ROWS; i += 2) {
    const a = entries[i];
    const b = entries[i + 1];
    const row: ReplyButton[] = [];
    if (a) row.push({ label: a.command.name, command: a.command.name });
    if (b) row.push({ label: b.command.name, command: b.command.name });
    rows.push(row);
  }
  rows.push([{ label: '❓ Help', command: 'help' }]);
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
      usage: '/menu',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const grouped = app.registry.byCategory();
        const allVisible: RegisteredCommand[] = [];
        const sections = categoryOrder
          .map((category) => {
            const entries = grouped[category]
              .filter((entry) => canSeeCommand(entry, ctx, app))
              .sort((left, right) => left.command.name.localeCompare(right.command.name));
            if (entries.length === 0) return '';
            allVisible.push(...entries);
            return [`${categoryTitle(category)}:`, ...entries.map(commandLine)].join('\n');
          })
          .filter(Boolean);

        await reply(ctx, sections.length ? sections.join('\n\n') : 'No commands available.', {
          buttons: allVisible.length > 0 ? buildMenuButtons(allVisible) : undefined,
          backTo: false,
        });
      },
    },
  ],
};

export default menuFeature;