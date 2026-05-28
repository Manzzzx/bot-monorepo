import { describe, expect, it, vi } from 'vitest';
import { reply } from './reply.js';
import { createMockCtx } from './testing/create-mock-ctx.js';

describe('reply helper — buttons fallback', () => {
  it('passes buttons through when capabilities.buttons is true', async () => {
    const ctx = createMockCtx({
      capabilities: { buttons: true, list: false, edit: true, reactions: false },
    });
    await reply(ctx, 'hello', {
      buttons: [[{ label: 'Refresh', command: 'ping' }]],
      backTo: false,
    });

    const call = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe('hello');
    expect(call?.[1]?.buttons).toEqual([[{ label: 'Refresh', command: 'ping' }]]);
  });

  it('strips buttons option but appends a numbered list when capabilities.buttons is false', async () => {
    const ctx = createMockCtx({
      capabilities: { buttons: false, list: false, edit: true, reactions: false },
    });
    await reply(ctx, 'hello', {
      buttons: [
        [
          { label: 'Refresh', command: 'ping' },
          { label: 'Stats', command: 'stats' },
        ],
      ],
      backTo: false,
    });

    const call = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toContain('hello');
    expect(call?.[0]).toMatch(/1\. Refresh.*\/?ping/s);
    expect(call?.[0]).toMatch(/2\. Stats.*\/?stats/s);
    expect(call?.[1]?.buttons).toBeUndefined();
  });

  it('emits a single fallback hint line so the user knows to reply with a number or command', async () => {
    const ctx = createMockCtx({
      capabilities: { buttons: false, list: false, edit: true, reactions: false },
    });
    await reply(ctx, 'hello', {
      buttons: [[{ label: 'Refresh', command: 'ping' }]],
      backTo: false,
    });

    const text = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(text.match(/Reply/g)?.length ?? 0).toBe(1);
  });

  it('falls back url buttons to "label — url" lines', async () => {
    const ctx = createMockCtx({
      capabilities: { buttons: false, list: false, edit: true, reactions: false },
    });
    await reply(ctx, 'hello', {
      buttons: [[{ label: 'Docs', url: 'https://example.com' }]],
      backTo: false,
    });

    const text = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(text).toContain('Docs');
    expect(text).toContain('https://example.com');
  });

  it('does not append a fallback block when there are no buttons at all', async () => {
    const ctx = createMockCtx({
      capabilities: { buttons: false, list: false, edit: true, reactions: false },
    });
    await reply(ctx, 'hello');

    const call = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe('hello');
    expect(call?.[1]).toBeUndefined();
  });
});
