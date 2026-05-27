import { vi } from 'vitest';
import type { Logger } from 'pino';
import type { MessageCtx } from '../message-ctx.js';

export function createMockCtx(overrides: Partial<MessageCtx> = {}): MessageCtx {
  const ctx: MessageCtx = {
    platform: 'wa',
    messageId: 'msg-1',
    chatId: 'chat-1',
    userId: 'user-1',
    isGroup: false,
    chatType: 'private',
    timestamp: Date.now(),
    capabilities: {
      buttons: false,
      list: false,
      edit: true,
      reactions: true,
    },
    text: '',
    command: null,
    args: [],
    flags: {},
    reply: vi.fn().mockResolvedValue(undefined),
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger,
    traceId: 'trace-1',
    raw: {},
    ...overrides,
  };

  return ctx;
}
