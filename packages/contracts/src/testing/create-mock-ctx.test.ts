import { describe, expect, it } from 'vitest';
import { createMockCtx } from './create-mock-ctx.js';

describe('createMockCtx', () => {
  it('allows overrides and spy assertions', async () => {
    const ctx = createMockCtx({ command: 'ping', text: '!ping' });

    await ctx.reply('pong');

    expect(ctx.command).toBe('ping');
    expect(ctx.text).toBe('!ping');
    expect(ctx.reply).toHaveBeenCalledWith('pong');
  });
});
