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

export interface ReplyOpts {
  quote?: boolean;
  mentions?: string[];
  media?: MediaRef | ReplyMedia;
}

export interface MessageCtx<TRaw = unknown> {
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string;
  isGroup: boolean;
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
