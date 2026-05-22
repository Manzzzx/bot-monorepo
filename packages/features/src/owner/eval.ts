import { runInNewContext } from 'node:vm';
import { inspect } from 'node:util';
import type { Feature } from '@bot/contracts';

const outputLimit = 4_000;
const timeoutMs = 1_000;

function capOutput(output: string): string {
  if (output.length <= outputLimit) return output;
  return `${output.slice(0, outputLimit)}\n... output truncated`;
}

function formatResult(value: unknown): string {
  if (typeof value === 'string') return value;
  return inspect(value, { depth: 3, breakLength: 120 });
}

async function awaitWithTimeout(value: unknown): Promise<unknown> {
  if (!(value instanceof Promise)) return value;

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      value,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Evaluation timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const evalFeature: Feature = {
  name: 'eval',
  version: '1.0.0',
  commands: [
    {
      name: 'eval',
      aliases: ['js'],
      description: 'Evaluate JavaScript in a sandbox.',
      usage: '/eval 1 + 1',
      async handler(ctx) {
        const code = ctx.args.join(' ').trim();
        if (!code) {
          await ctx.reply('Usage: /eval <javascript>');
          return;
        }

        try {
          const result = runInNewContext(
            code,
            {
              Array,
              Boolean,
              Date,
              JSON,
              Math,
              Number,
              Object,
              Promise,
              RegExp,
              String,
            },
            { timeout: timeoutMs },
          );
          const resolved = await awaitWithTimeout(result);
          await ctx.reply(capOutput(formatResult(resolved)));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await ctx.reply(capOutput(`Error: ${message}`));
        }
      },
    },
  ],
};

export default evalFeature;