import type { Feature, RegisteredCommand, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx, canSeeCommand, categoryTitle, visibleCommands } from './_registry.js';

function usageLine(commandName: string): string {
  return `Use /help ${commandName} for details.`;
}

function buildButtons(entries: RegisteredCommand[]): ReplyButton[][] {
  const rows: ReplyButton[][] = [];
  for (let i = 0; i < entries.length && rows.length < 4; i += 2) {
    const a = entries[i];
    const b = entries[i + 1];
    const row: ReplyButton[] = [];
    if (a) row.push({ label: a.command.name, command: a.command.name });
    if (b) row.push({ label: b.command.name, command: b.command.name });
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
      usage: '/help [command]',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        const requested = ctx.args[0]?.toLowerCase();

        if (requested) {
          const entry = app.registry.resolve(requested);
          if (!entry || !canSeeCommand(entry, ctx, app)) {
            await reply(ctx, `No help found for ${requested}.`, { backTo: 'help' });
            return;
          }

          const command = entry.command;
          const aliases = command.aliases?.length ? command.aliases.join(', ') : '-';
          const detailButtons: ReplyButton[][] = [
            [{ label: `▶ Run /${command.name}`, command: command.name }],
          ];
          await reply(
            ctx,
            [
              `Command: /${command.name}`,
              `Category: ${categoryTitle(entry.category)}`,
              `Description: ${command.description}`,
              `Usage: ${command.usage ?? `/${command.name}`}`,
              `Aliases: ${aliases}`,
            ].join('\n'),
            { buttons: detailButtons, backTo: 'help' },
          );
          return;
        }

        const entries = visibleCommands(ctx, app);
        if (entries.length === 0) {
          await reply(ctx, 'No commands available.');
          return;
        }

        const lines = entries.map(
          (entry) => `- /${entry.command.name}: ${entry.command.description}`,
        );
        await reply(
          ctx,
          ['Available commands:', ...lines, usageLine(entries[0]?.command.name ?? 'ping')].join(
            '\n',
          ),
          { buttons: buildButtons(entries), backTo: false },
        );
      },
    },
  ],
};

export default helpFeature;