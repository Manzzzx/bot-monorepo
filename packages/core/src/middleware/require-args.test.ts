import { describe, expect, it, vi } from 'vitest';
import type { Command, MessageCtx, RegisteredCommand } from '@bot/contracts';
import { requireArgs } from './require-args.js';

function mkCtx(args: string[], commandName: string | null = 'tt'): MessageCtx {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    platform: 'wa',
    messageId: 'm1',
    chatId: 'c1',
    userId: 'u1',
    isGroup: false,
    chatType: 'private',
    timestamp: Date.now(),
    capabilities: { buttons: false, list: false, edit: false, reactions: false },
    text: `/${commandName ?? ''} ${args.join(' ')}`.trim(),
    command: commandName,
    args,
    flags: {},
    reply,
    logger: { child: () => ({}) } as never,
    traceId: 't1',
    raw: {},
  } as unknown as MessageCtx;
}

const command: Command = {
  name: 'tiktok',
  description: 'Download TikTok video.',
  usage: '/tiktok <url>',
  examples: ['/tiktok https://vt.tiktok.com/abc'],
  handler: async () => {},
};

function attachMatched(ctx: MessageCtx, c: Command): void {
  (ctx as unknown as { matchedCommand: RegisteredCommand }).matchedCommand = {
    command: c,
    feature: { name: 'tiktok', version: '1.0.0' },
    category: 'downloader',
    fullName: 'downloader/tiktok:tiktok',
  };
}

describe('requireArgs', () => {
  it('calls next when enough args', async () => {
    const ctx = mkCtx(['https://x.com']);
    attachMatched(ctx, command);
    const next = vi.fn().mockResolvedValue(undefined);
    await requireArgs(1)(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('replies usage and stops when args missing', async () => {
    const ctx = mkCtx([]);
    attachMatched(ctx, command);
    const next = vi.fn();
    await requireArgs(1)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(message).toContain('tiktok');
    expect(message).toContain('/tiktok <url>');
    expect(message).toContain('https://vt.tiktok.com/abc');
  });

  it('treats whitespace-only args as missing', async () => {
    const ctx = mkCtx(['   ']);
    attachMatched(ctx, command);
    const next = vi.fn();
    await requireArgs(1)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
  });

  it('falls back to ctx.command when matchedCommand absent', async () => {
    const ctx = mkCtx([], 'foo');
    const next = vi.fn();
    await requireArgs(1)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    const message = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(message).toContain('/foo');
  });

  it('respects min > 1', async () => {
    const ctx = mkCtx(['only-one']);
    attachMatched(ctx, command);
    const next = vi.fn();
    await requireArgs(2)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
  });
});
