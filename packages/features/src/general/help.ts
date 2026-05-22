import type { Feature } from '@bot/contracts';
import { appFromCtx, canSeeCommand, categoryTitle, visibleCommands } from './_registry.js';

function usageLine(commandName: string): string {
  return `Use /help ${commandName} for details.`;
}

const helpFeature: Feature = {
  name: 'help',
  version: '1.0.0',
  commands: [
    {
      name: 'help',
      aliases: ['h'],
      description: 'Show command help.',
      usage: '/help [command]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const requested = ctx.args[0]?.toLowerCase();

        if (requested) {
          const entry = app.registry.resolve(requested);
          if (!entry || !canSeeCommand(entry, ctx, app)) {
            await ctx.reply(`No help found for ${requested}.`);
            return;
          }

          const command = entry.command;
          const aliases = command.aliases?.length ? command.aliases.join(', ') : '-';
          await ctx.reply(
            [
              `Command: /${command.name}`,
              `Category: ${categoryTitle(entry.category)}`,
              `Description: ${command.description}`,
              `Usage: ${command.usage ?? `/${command.name}`}`,
              `Aliases: ${aliases}`,
            ].join('\n'),
          );
          return;
        }

        const entries = visibleCommands(ctx, app);
        if (entries.length === 0) {
          await ctx.reply('No commands available.');
          return;
        }

        const lines = entries.map(
          (entry) => `- /${entry.command.name}: ${entry.command.description}`,
        );
        await ctx.reply(
          ['Available commands:', ...lines, usageLine(entries[0]?.command.name ?? 'ping')].join(
            '\n',
          ),
        );
      },
    },
  ],
};

export default helpFeature;