import type { Logger } from 'pino';
import type { proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { ulid } from 'ulid';
import type {
  AppContext,
  MediaKind,
  MediaRef,
  MessageCtx,
  Platform,
  PlatformCapabilities,
  ReplyOpts,
} from '@bot/contracts';

const WA_CAPABILITIES: PlatformCapabilities = {
  buttons: false,
  list: false,
  edit: true,
  reactions: true,
};

const PLATFORM: Platform = 'wa';

interface WaCtxDeps {
  socket: WASocket;
  app: Pick<AppContext, 'logger' | 'rateLimit'>;
  logger: Logger;
}

function extractText(msg: WAMessage): string {
  const message = msg.message;
  if (!message) return '';
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    ''
  );
}

function maybeMime(value: string | null | undefined): { mimeType?: string } {
  return typeof value === 'string' ? { mimeType: value } : {};
}

function detectMedia(msg: WAMessage): { kind: MediaKind; mimeType?: string } | null {
  const message = msg.message;
  if (!message) return null;
  if (message.imageMessage) return { kind: 'image', ...maybeMime(message.imageMessage.mimetype) };
  if (message.videoMessage) return { kind: 'video', ...maybeMime(message.videoMessage.mimetype) };
  if (message.audioMessage) return { kind: 'audio', ...maybeMime(message.audioMessage.mimetype) };
  if (message.documentMessage)
    return { kind: 'document', ...maybeMime(message.documentMessage.mimetype) };
  if (message.stickerMessage)
    return { kind: 'sticker', ...maybeMime(message.stickerMessage.mimetype) };
  return null;
}

function buildMediaRef(msg: WAMessage, logger: Logger): MediaRef | undefined {
  const detected = detectMedia(msg);
  if (!detected) return undefined;

  return {
    kind: detected.kind,
    ...(detected.mimeType !== undefined ? { mimeType: detected.mimeType } : {}),
    download: async () => {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger, reuploadRequest: async () => msg },
      );
      return buffer as Buffer;
    },
  };
}

function chatIdOf(msg: WAMessage): string {
  return msg.key.remoteJid ?? '';
}

function userIdOf(msg: WAMessage): string {
  return msg.key.participant ?? msg.key.remoteJid ?? '';
}

function isGroupChat(chatId: string): boolean {
  return chatId.endsWith('@g.us');
}

async function scheduleSend(
  app: Pick<AppContext, 'rateLimit'>,
  chatId: string,
  task: () => Promise<void>,
): Promise<void> {
  await app.rateLimit.outbound(PLATFORM, chatId).schedule(() => task());
}

export function createWaMessageCtx(deps: WaCtxDeps, message: WAMessage): MessageCtx<WAMessage> {
  const chatId = chatIdOf(message);
  const userId = userIdOf(message);
  const isGroup = isGroupChat(chatId);
  const text = extractText(message);
  const mediaRef = buildMediaRef(message, deps.logger);
  const traceId = ulid();
  const messageId = message.key.id ?? traceId;
  const timestamp = Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000;

  const childLogger = deps.logger.child({ platform: PLATFORM, chatId, userId, messageId });

  const ctx: MessageCtx<WAMessage> = {
    platform: PLATFORM,
    messageId,
    chatId,
    userId,
    isGroup,
    timestamp,
    capabilities: WA_CAPABILITIES,
    text,
    command: null,
    args: [],
    flags: {},
    ...(message.message?.extendedTextMessage?.contextInfo?.stanzaId
      ? { replyToId: message.message.extendedTextMessage.contextInfo.stanzaId }
      : {}),
    ...(mediaRef ? { media: mediaRef } : {}),
    logger: childLogger,
    traceId,
    raw: message,
    async reply(replyText: string, opts?: ReplyOpts): Promise<void> {
      await scheduleSend(deps.app, chatId, async () => {
        const content: Parameters<WASocket['sendMessage']>[1] =
          opts?.media && 'buffer' in opts.media
            ? buildMediaContent(opts.media, replyText)
            : { text: replyText };
        const sendOpts: Parameters<WASocket['sendMessage']>[2] = opts?.quote
          ? { quoted: message }
          : {};
        await deps.socket.sendMessage(chatId, content, sendOpts);
      });
    },
    async edit(newText: string): Promise<void> {
      if (!message.key.id) return;
      await scheduleSend(deps.app, chatId, async () => {
        await deps.socket.sendMessage(chatId, {
          edit: message.key as proto.IMessageKey,
          text: newText,
        } as Parameters<WASocket['sendMessage']>[1]);
      });
    },
    async delete(): Promise<void> {
      if (!message.key.id) return;
      await scheduleSend(deps.app, chatId, async () => {
        await deps.socket.sendMessage(chatId, {
          delete: message.key as proto.IMessageKey,
        } as Parameters<WASocket['sendMessage']>[1]);
      });
    },
    async react(emoji: string): Promise<void> {
      await scheduleSend(deps.app, chatId, async () => {
        await deps.socket.sendMessage(chatId, {
          react: { text: emoji, key: message.key as proto.IMessageKey },
        } as Parameters<WASocket['sendMessage']>[1]);
      });
    },
  };

  return ctx;
}

function buildMediaContent(
  media: { buffer: Buffer; mimeType: string; filename?: string },
  caption: string,
): Parameters<WASocket['sendMessage']>[1] {
  if (media.mimeType.startsWith('image/')) {
    return { image: media.buffer, caption };
  }
  if (media.mimeType.startsWith('video/')) {
    return { video: media.buffer, caption };
  }
  if (media.mimeType.startsWith('audio/')) {
    return { audio: media.buffer, mimetype: media.mimeType };
  }
  return {
    document: media.buffer,
    mimetype: media.mimeType,
    fileName: media.filename ?? 'file',
    caption,
  };
}

export function isUserMessage(msg: WAMessage): boolean {
  if (!msg.key.remoteJid) return false;
  if (msg.key.fromMe) return false;
  if (!msg.message) return false;
  if (msg.message.protocolMessage) return false;
  if (msg.message.reactionMessage) return false;
  return true;
}
