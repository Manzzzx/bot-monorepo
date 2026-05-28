import type { Logger } from 'pino';
import type { Platform, PlatformCapabilities } from './platform.js';

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface MediaRef {
  kind: MediaKind;
  mimeType?: string;
  download(): Promise<Buffer>;
}

export interface ReplyMedia {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

/**
 * Inline button for platforms that support them (e.g. Telegram).
 * Set exactly one of `command` or `url`.
 *
 * - `command`: re-dispatched as if the user typed it (prefix auto-prepended).
 * - `url`: opens an external link.
 */
export interface ReplyButton {
  label: string;
  command?: string;
  url?: string;
}

export type ParseMode = 'markdown' | 'html';

export interface ReplyOpts {
  quote?: boolean | undefined;
  mentions?: string[] | undefined;
  media?: MediaRef | ReplyMedia | undefined;
  parseMode?: ParseMode | undefined;
  /**
   * Inline keyboard rows. Outer = rows, inner = buttons in that row.
   * Adapters whose `capabilities.buttons` is false silently ignore this.
   */
  buttons?: ReplyButton[][] | undefined;
}

export type ChatType = 'private' | 'group';

export interface MessageCtx<TRaw = unknown> {
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string;
  isGroup: boolean;
  chatType: ChatType;
  chatName?: string | undefined;
  userName?: string | undefined;
  timestamp: number;
  capabilities: PlatformCapabilities;
  text: string;
  command: string | null;
  args: string[];
  flags: Record<string, string | boolean | number>;
  replyToId?: string;
  media?: MediaRef;
  reply(text: string, opts?: ReplyOpts): Promise<void>;
  edit?(text: string): Promise<void>;
  delete?(): Promise<void>;
  react?(emoji: string): Promise<void>;
  logger: Logger;
  traceId: string;
  raw: TRaw;
}
