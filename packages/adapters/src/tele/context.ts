import { InlineKeyboard, type Context as GrammyContext } from 'grammy';
import { ulid } from 'ulid';
import { sendWithMarkdownFallback } from './markdown-fallback.js';
import type {
  AppContext,
  MediaKind,
  MediaRef,
  MessageCtx,
  Platform,
  PlatformCapabilities,
  ReplyButton,
  ReplyOpts,
} from '@bot/contracts';

const TELE_CAPABILITIES: PlatformCapabilities = {
  buttons: true,
  list: true,
  edit: true,
  reactions: true,
};

const PLATFORM: Platform = 'tele';
const TELE_CALLBACK_DATA_MAX = 64;
const TELE_CALLBACK_PREFIX = 'cmd:';

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

export function buildInlineKeyboard(rows: ReplyButton[][] | undefined): InlineKeyboard | null {
  if (!rows || rows.length === 0) return null;
  const keyboard = new InlineKeyboard();
  let hasAny = false;
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    for (const button of row) {
      if (!button.label) continue;
      if (button.url) {
        keyboard.url(button.label, button.url);
        hasAny = true;
        continue;
      }
      if (button.command) {
        const encoded = `${TELE_CALLBACK_PREFIX}${button.command}`;
        const buf = Buffer.from(encoded, 'utf8');
        const safe =
          buf.byteLength > TELE_CALLBACK_DATA_MAX
            ? buf.subarray(0, TELE_CALLBACK_DATA_MAX).toString('utf8')
            : encoded;
        keyboard.text(button.label, safe);
        hasAny = true;
      }
    }
    keyboard.row();
  }
  return hasAny ? keyboard : null;
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
  const chatType: 'private' | 'group' = isGroup ? 'group' : 'private';
  const chatName =
    'title' in message.chat && typeof message.chat.title === 'string' && message.chat.title
      ? message.chat.title
      : undefined;
  const userName =
    message.from?.username ??
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') ??
    undefined;
  const text = extractText(update);
  const traceId = ulid();
  const messageId = String(message.message_id);
  const timestamp = message.date * 1000;
  const childLogger = deps.app.logger.child({
    platform: PLATFORM,
    chatId,
    chatType,
    ...(chatName ? { chatName } : {}),
    userId,
    ...(userName ? { userName } : {}),
    messageId,
  });
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
    chatType,
    ...(chatName ? { chatName } : {}),
    ...(userName ? { userName } : {}),
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
      const keyboard = buildInlineKeyboard(opts?.buttons);
      const parseMode =
        opts?.parseMode === 'markdown'
          ? 'Markdown'
          : opts?.parseMode === 'html'
            ? 'HTML'
            : undefined;
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        if (opts?.media && 'buffer' in opts.media) {
          const grammyMod = await import('grammy');
          const inputFile = new grammyMod.InputFile(
            opts.media.buffer,
            opts.media.filename ?? 'file',
          );
          const mediaOpts: Record<string, unknown> = { caption: replyText };
          if (parseMode) mediaOpts.parse_mode = parseMode;
          if (keyboard) mediaOpts.reply_markup = keyboard;
          if (opts.media.mimeType.startsWith('image/')) {
            await update.api.sendPhoto(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('video/')) {
            await update.api.sendVideo(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('audio/')) {
            await update.api.sendAudio(chatId, inputFile, mediaOpts);
            return;
          }
          await update.api.sendDocument(chatId, inputFile, mediaOpts);
          return;
        }
        const sendOpts: Record<string, unknown> = {};
        if (parseMode) sendOpts.parse_mode = parseMode;
        if (opts?.quote) sendOpts.reply_parameters = { message_id: Number(messageId) };
        if (keyboard) sendOpts.reply_markup = keyboard;
        await sendWithMarkdownFallback(
          (opts) => update.api.sendMessage(chatId, replyText, opts),
          sendOpts,
          parseMode,
          childLogger,
          { chatId, op: 'reply.sendMessage' },
        );
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

export function createTeleCallbackCtx(
  deps: TeleCtxDeps,
  update: GrammyContext,
): MessageCtx<GrammyContext> | null {
  const cb = update.callbackQuery;
  if (!cb || !cb.message) return null;
  const data = typeof cb.data === 'string' ? cb.data : '';
  if (!data.startsWith(TELE_CALLBACK_PREFIX)) return null;

  const command = data.slice(TELE_CALLBACK_PREFIX.length);
  const chatId = String(cb.message.chat.id);
  const userId = String(cb.from.id);
  const isGroup = cb.message.chat.type === 'group' || cb.message.chat.type === 'supergroup';
  const chatType: 'private' | 'group' = isGroup ? 'group' : 'private';
  const chatName =
    'title' in cb.message.chat && typeof cb.message.chat.title === 'string' && cb.message.chat.title
      ? cb.message.chat.title
      : undefined;
  const userName =
    cb.from.username ??
    [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') ??
    undefined;
  const traceId = ulid();
  const triggerMessageId = String(cb.message.message_id);
  const timestamp = Date.now();
  const childLogger = deps.app.logger.child({
    platform: PLATFORM,
    chatId,
    chatType,
    ...(chatName ? { chatName } : {}),
    userId,
    ...(userName ? { userName } : {}),
    messageId: triggerMessageId,
    via: 'callback',
  });

  const callbackMessage = cb.message as unknown as {
    text?: string;
    photo?: unknown;
    video?: unknown;
    audio?: unknown;
    document?: unknown;
  };
  const canEditInPlace =
    typeof callbackMessage.text === 'string' &&
    !callbackMessage.photo &&
    !callbackMessage.video &&
    !callbackMessage.audio &&
    !callbackMessage.document;

  return {
    platform: PLATFORM,
    messageId: triggerMessageId,
    chatId,
    userId,
    isGroup,
    chatType,
    ...(chatName ? { chatName } : {}),
    ...(userName ? { userName } : {}),
    timestamp,
    capabilities: TELE_CAPABILITIES,
    text: command.startsWith('/') || command.startsWith('.') ? command : `/${command}`,
    command: null,
    args: [],
    flags: {},
    replyToId: triggerMessageId,
    logger: childLogger,
    traceId,
    raw: update,
    async reply(replyText: string, opts?: ReplyOpts): Promise<void> {
      const keyboard = buildInlineKeyboard(opts?.buttons);
      const parseMode =
        opts?.parseMode === 'markdown'
          ? 'Markdown'
          : opts?.parseMode === 'html'
            ? 'HTML'
            : undefined;
      await deps.app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        if (opts?.media && 'buffer' in opts.media) {
          const grammyMod = await import('grammy');
          const inputFile = new grammyMod.InputFile(
            opts.media.buffer,
            opts.media.filename ?? 'file',
          );
          const mediaOpts: Record<string, unknown> = { caption: replyText };
          if (parseMode) mediaOpts.parse_mode = parseMode;
          if (keyboard) mediaOpts.reply_markup = keyboard;
          if (opts.media.mimeType.startsWith('image/')) {
            await update.api.sendPhoto(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('video/')) {
            await update.api.sendVideo(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('audio/')) {
            await update.api.sendAudio(chatId, inputFile, mediaOpts);
            return;
          }
          await update.api.sendDocument(chatId, inputFile, mediaOpts);
          return;
        }

        if (canEditInPlace) {
          try {
            const editOpts: Record<string, unknown> = {};
            if (parseMode) editOpts.parse_mode = parseMode;
            if (keyboard) editOpts.reply_markup = keyboard;
            await sendWithMarkdownFallback(
              (opts) =>
                update.api.editMessageText(chatId, Number(triggerMessageId), replyText, opts),
              editOpts,
              parseMode,
              childLogger,
              { chatId, op: 'callback.editMessageText' },
            );
            return;
          } catch (error) {
            childLogger.warn(
              { err: error, status: 'rejected' },
              'editMessageText failed, falling back to sendMessage',
            );
          }
        }

        const sendOpts: Record<string, unknown> = {};
        if (parseMode) sendOpts.parse_mode = parseMode;
        if (keyboard) sendOpts.reply_markup = keyboard;
        await sendWithMarkdownFallback(
          (opts) => update.api.sendMessage(chatId, replyText, opts),
          sendOpts,
          parseMode,
          childLogger,
          { chatId, op: 'callback.sendMessage' },
        );
      });
    },
  };
}
