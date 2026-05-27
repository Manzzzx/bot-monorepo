import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { isMarkdownParseError, sendWithMarkdownFallback } from './markdown-fallback.js';

function makeLogger(): Logger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

describe('isMarkdownParseError', () => {
  it('matches Telegram parse-error envelope', () => {
    expect(isMarkdownParseError({ error_code: 400, description: "can't parse entities" })).toBe(true);
    expect(isMarkdownParseError({ error_code: 400, description: 'Bad Request: entity at byte 5' })).toBe(true);
  });
  it('rejects unrelated 400s', () => {
    expect(isMarkdownParseError({ error_code: 400, description: 'chat not found' })).toBe(false);
  });
  it('rejects non-400 errors', () => {
    expect(isMarkdownParseError({ error_code: 401, description: 'unauthorized' })).toBe(false);
  });
  it('rejects null and primitives', () => {
    expect(isMarkdownParseError(null)).toBe(false);
    expect(isMarkdownParseError('boom')).toBe(false);
  });
});

describe('sendWithMarkdownFallback', () => {
  it('passes through when send succeeds', async () => {
    const send = vi.fn().mockResolvedValue('ok');
    const baseOpts = { parse_mode: 'Markdown', text: 'hi' };
    await sendWithMarkdownFallback(send, baseOpts, 'Markdown', makeLogger());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(baseOpts);
  });

  it('retries without parse_mode on markdown parse error', async () => {
    const parseError = { error_code: 400, description: "can't parse entities at byte 12" };
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseError)
      .mockResolvedValueOnce(undefined);
    const logger = makeLogger();
    await sendWithMarkdownFallback(
      send,
      { parse_mode: 'Markdown', other: 1 },
      'Markdown',
      logger,
      { chatId: 'c1' },
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual({ other: 1 });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('rethrows non-parse errors unchanged', async () => {
    const other = { error_code: 403, description: 'forbidden' };
    const send = vi.fn().mockRejectedValueOnce(other);
    await expect(
      sendWithMarkdownFallback(send, { parse_mode: 'Markdown' }, 'Markdown', makeLogger()),
    ).rejects.toBe(other);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rethrows when no parseMode set even on parse error', async () => {
    const parseError = { error_code: 400, description: 'parse failed' };
    const send = vi.fn().mockRejectedValueOnce(parseError);
    await expect(
      sendWithMarkdownFallback(send, {}, undefined, makeLogger()),
    ).rejects.toBe(parseError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});