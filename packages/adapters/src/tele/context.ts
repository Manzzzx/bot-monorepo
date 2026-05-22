import type { Context as GrammyContext } from 'grammy';
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

const TELE_CAPABILITIES: PlatformCapabilities = {
  buttons: true,
  list: true,
  edit: true,
  reactions: true,
};

const PLATFORM: Platform = 'tele';

interface TeleCtxDeps {
  app: Pick<AppContext, 'logger' | 'rateLimit'>;
}

interface DetectedMedia {
  kind: MediaKind;
  fileId: string;
  mimeType?: string;
}

function maybeMime(value: string | null | undefined): { mimeType?: string } {
  return typeof value === 'string' ? { mimeType: value } : {};
}

function detectMedia(update: GrammyContext): DetectedMedia | null {
  const message = update.message ?? update.editedMessage;
  if (!message) return null;
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    if (!largest) return null;
    return { kind: 'image', fileId: largest.file_id };
  }
  if (message.video)
    return { kind: 'video', fileId: message.video.file_id, ...maybeMime(message.video.mime_type) };
  if (message.audio)
    return { kind: 'audio', fileId: message.audio.file_id, ...maybeMime(message.audio.mime_type) };
  if (message.voice)
    return { kind: 'audio', fileId: message.voice.file_id, ...maybeMime(message.voice.mime_type) };
  if (message.document)
    return {
      kind: 'document',
      fileId: message.document.file_id,
      ...maybeMime(message.document.mime_type),
    };
  if (message.sticker) return { kind: 'sticker', fileId: message.sticker.file_id };
  return null;
}

async function fetchTelegramFile(ctx: GrammyContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram file path missing.');
  const token = (ctx.api as unknown as { token: string }).token;
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function buildMediaRef(update: GrammyContext): MediaRef | undefined {
  const detected = detectMedia(update);
  if (!detected) return undefined;
  const base: MediaRef = {
    kind: detected.kind,
    download: () => fetchTelegramFile(update, detected.fileId),
  };
  return detected.mimeType !== undefined ? { ...base, mimeType: detected.mimeType } : base;
}

function extractText(update: GrammyContext): string {
  const message = update.message ?? update.editedMessage;
  if (!message) return '';
  return message.text ?? message.caption ?? '';
}

export function createTeleMessageCtx(
  deps: TeleCtxDeps,
  update: GrammyContext,
): MessageCtx<GrammyContext> {
  const message = update.message ?? update.editedMessage;
  if (!message) throw new Error('Telegram update has no message.');

  const chatId = String(message.chat.id);
  const userId = String(message.from?.id ?? message.chat.id);
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  const text = extractText(update);
  const traceId = ulid();
  const messageId = String(message.message_id);
  const timestamp = message.date * 1000;
  const childLogger = deps.app.logger.child({ platform: PLATFORM, chatId, userId, messageId });
  const mediaRef = buildMediaRef(update);

  const optionalProps: Partial<MessageCtx<GrammyContext>> = {};
  if (message.reply_to_message)
    optionalProps.replyToId = String(message.reply_to_message.message_id);
  if (mediaRef) optionalProps.media = mediaRef;

  const ctx: MessageCtx<GrammyContext> = {
    platform: PLATFORM,
    messageId,
    chatId,
    userId,
    isGroup,
    timestamp,
    capabilities: TELE_CAPABILITIES,
    text,
    command: null,
    args: [],
    flags: {},
    ...optionalProps,
    logger: childLogger,
    traceId,
    raw: update,
    async reply(replyText: string, opts?: ReplyOpts): Promise<void> {
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        if (opts?.media && 'buffer' in opts.media) {
          const grammyMod = await import('grammy');
          const inputFile = new grammyMod.InputFile(
            opts.media.buffer,
            opts.media.filename ?? 'file',
          );
          if (opts.media.mimeType.startsWith('image/')) {
            await update.api.sendPhoto(chatId, inputFile, { caption: replyText });
            return;
          }
          if (opts.media.mimeType.startsWith('video/')) {
            await update.api.sendVideo(chatId, inputFile, { caption: replyText });
            return;
          }
          if (opts.media.mimeType.startsWith('audio/')) {
            await update.api.sendAudio(chatId, inputFile, { caption: replyText });
            return;
          }
          await update.api.sendDocument(chatId, inputFile, { caption: replyText });
          return;
        }

        const sendOpts = opts?.quote ? { reply_parameters: { message_id: Number(messageId) } } : {};
        await update.api.sendMessage(chatId, replyText, sendOpts);
      });
    },
    async edit(newText: string): Promise<void> {
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        await update.api.editMessageText(chatId, Number(messageId), newText);
      });
    },
    async delete(): Promise<void> {
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        await update.api.deleteMessage(chatId, Number(messageId));
      });
    },
    async react(emoji: string): Promise<void> {
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        try {
          await update.api.setMessageReaction(chatId, Number(messageId), [
            { type: 'emoji', emoji } as Parameters<typeof update.api.setMessageReaction>[2][number],
          ]);
        } catch {
          // best effort
        }
      });
    },
  };

  return ctx;
}

export function hasUserMessage(update: GrammyContext): boolean {
  const message = update.message ?? update.editedMessage;
  if (!message) return false;
  if (message.from?.is_bot) return false;
  return true;
}
