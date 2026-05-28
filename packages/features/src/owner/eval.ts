import { runInNewContext } from 'node:vm';
import { inspect } from 'node:util';
import type { Feature, ReplyButton } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx } from './_shared.js';

const outputLimit = 4_000;
const timeoutMs = 1_000;
const followUp: ReplyButton[][] = [[{ label: '📋 Menu', command: 'menu' }]];

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
      description: 'Evaluate JavaScript in a sandbox (dev only).',
      usage: '/eval 1 + 1',
      async handler(ctx) {
        const app = appFromCtx(ctx);
        if (!app.config.OWNER_EVAL_ENABLED) {
          await reply(
            ctx,
            '🚫 /eval is disabled. Set OWNER_EVAL_ENABLED=true (dev hosts only). node:vm is not a security sandbox.',
            { buttons: followUp, backTo: false },
          );
          return;
        }
        if (app.config.NODE_ENV === 'production') {
          await reply(
            ctx,
            '🚫 /eval refuses to run in production even with OWNER_EVAL_ENABLED=true.',
            { buttons: followUp, backTo: false },
          );
          return;
        }

        const code = ctx.args.join(' ').trim();
        if (!code) {
          await reply(ctx, 'Usage: /eval <javascript>');
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
          await reply(ctx, capOutput(formatResult(resolved)), { buttons: followUp, backTo: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await reply(ctx, capOutput(`Error: ${message}`), { buttons: followUp, backTo: false });
        }
      },
    },
  ],
};

export default evalFeature;
