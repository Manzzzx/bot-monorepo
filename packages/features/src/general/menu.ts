import type { Feature, FeatureCategory, RegisteredCommand } from '@bot/contracts';
import { appFromCtx, canSeeCommand, categoryTitle } from './_registry.js';

const categoryOrder: FeatureCategory[] = ['general', 'owner', 'group'];

function commandLine(entry: RegisteredCommand): string {
  const aliases = entry.command.aliases?.length ? ` (${entry.command.aliases.join(', ')})` : '';
  return `- /${entry.command.name}${aliases}: ${entry.command.description}`;
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
        const sections = categoryOrder
          .map((category) => {
            const entries = grouped[category]
              .filter((entry) => canSeeCommand(entry, ctx, app))
              .sort((left, right) => left.command.name.localeCompare(right.command.name));
            if (entries.length === 0) return '';
            return [`${categoryTitle(category)}:`, ...entries.map(commandLine)].join('\n');
          })
          .filter(Boolean);

        await ctx.reply(sections.length ? sections.join('\n\n') : 'No commands available.');
      },
    },
  ],
};

export default menuFeature;