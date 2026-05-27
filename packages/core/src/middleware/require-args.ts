import type { Command, MessageCtx, Middleware, RegisteredCommand } from '@bot/contracts';

interface MatchedCtx {
  matchedCommand?: RegisteredCommand;
}

function commandFor(ctx: MessageCtx): Command {
  const matched = (ctx as MessageCtx & MatchedCtx).matchedCommand;
  if (matched) return matched.command;
  const fallbackName = ctx.command ?? 'command';
  return {
    name: fallbackName,
    description: '',
    usage: `/${fallbackName} <args>`,
    handler: async () => {},
  };
}

function buildUsageMessage(command: Command): string {
  const lines: string[] = [];
  lines.push(
    command.description
      ? `📌 *${command.name}* — ${command.description}`
      : `📌 *${command.name}*`,
  );
  lines.push('');
  lines.push(`Cara pakai: \`${command.usage ?? `/${command.name}`}\``);
  if (command.examples?.length) {
    lines.push('');
    lines.push('Contoh:');
    for (const example of command.examples) lines.push(`• \`${example}\``);
  }
  return lines.join('\n');
}

export function requireArgs(min: number): Middleware {
  return async function requireArgsMiddleware(ctx, next) {
    const valid = ctx.args.filter((arg) => arg.trim().length > 0);
    if (valid.length >= min) {
      await next();
      return;
    }
    await ctx.reply(buildUsageMessage(commandFor(ctx)));
  };
}