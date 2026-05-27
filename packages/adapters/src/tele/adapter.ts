import { Bot, type Context as GrammyContext } from 'grammy';
import { sendWithMarkdownFallback } from './markdown-fallback.js';
import type { AppContext, MessageAdapter, MessageCtx, Platform, ReplyOpts } from '@bot/contracts';
import {
  buildInlineKeyboard,
  createTeleCallbackCtx,
  createTeleMessageCtx,
  hasUserMessage,
} from './context.js';

const PLATFORM: Platform = 'tele';

export interface TeleAdapterOptions {
  app: Pick<AppContext, 'config' | 'logger' | 'rateLimit' | 'bus'>;
  onMessage(ctx: MessageCtx): Promise<void> | void;
}

export interface TeleAdapter extends MessageAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
}

export function createTeleAdapter(options: TeleAdapterOptions): TeleAdapter {
  const { app, onMessage } = options;
  const logger = app.logger.child({ adapter: 'tele' });

  const token = app.config.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required to start telegram adapter.');

  const bot = new Bot<GrammyContext>(token);
  let started = false;
  let paused = false;

  bot.on('message', async (ctx) => {
    if (paused) return;
    if (!hasUserMessage(ctx)) return;
    const messageCtx = createTeleMessageCtx({ app }, ctx);
    try {
      await onMessage(messageCtx);
    } catch (error) {
      logger.error({ err: error, status: 'error' }, 'Telegram onMessage handler failed');
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    if (paused) return;
    try {
      await ctx.answerCallbackQuery();
    } catch (error) {
      logger.warn({ err: error, status: 'rejected' }, 'answerCallbackQuery failed');
    }
    const messageCtx = createTeleCallbackCtx({ app }, ctx);
    if (!messageCtx) {
      logger.debug({ status: 'rejected' }, 'Callback data did not match cmd: prefix');
      return;
    }
    try {
      await onMessage(messageCtx);
    } catch (error) {
      logger.error({ err: error, status: 'error' }, 'Telegram callback handler failed');
    }
  });

  bot.catch((error) => {
    logger.error({ err: error.error, status: 'error' }, 'Telegram bot caught error');
  });

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    paused = false;

    bot
      .start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        onStart: () => {
          app.bus.emit('connection.ready', { platform: PLATFORM });
          logger.info({ status: 'ok' }, 'Telegram polling started');
        },
      })
      .catch((error) => {
        logger.error({ err: error, status: 'error' }, 'Telegram polling failed');
        app.bus.emit('connection.lost', { platform: PLATFORM });
      });
  }

  async function stop(): Promise<void> {
    if (!started) return;
    started = false;
    try {
      await bot.stop();
    } catch (error) {
      logger.warn({ err: error, status: 'rejected' }, 'Telegram bot stop failed');
    }
  }

  return {
    platform: PLATFORM,
    async sendMessage(chatId: string, text: string, opts?: ReplyOpts): Promise<void> {
      const keyboard = buildInlineKeyboard(opts?.buttons);
      const parseMode = opts?.parseMode === 'markdown' ? 'Markdown' : opts?.parseMode === 'html' ? 'HTML' : undefined;
      await app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        if (opts?.media && 'buffer' in opts.media) {
          const grammy = await import('grammy');
          const inputFile = new grammy.InputFile(opts.media.buffer, opts.media.filename ?? 'file');
          const mediaOpts: Record<string, unknown> = { caption: text };
          if (parseMode) mediaOpts.parse_mode = parseMode;
          if (keyboard) mediaOpts.reply_markup = keyboard;
          if (opts.media.mimeType.startsWith('image/')) {
            await bot.api.sendPhoto(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('video/')) {
            await bot.api.sendVideo(chatId, inputFile, mediaOpts);
            return;
          }
          if (opts.media.mimeType.startsWith('audio/')) {
            await bot.api.sendAudio(chatId, inputFile, mediaOpts);
            return;
          }
          await bot.api.sendDocument(chatId, inputFile, mediaOpts);
          return;
        }
        const sendOpts: Record<string, unknown> = {};
        if (parseMode) sendOpts.parse_mode = parseMode;
        if (keyboard) sendOpts.reply_markup = keyboard;
        await sendWithMarkdownFallback(
          (opts) => bot.api.sendMessage(chatId, text, opts),
          sendOpts,
          parseMode,
          logger,
          { chatId, op: 'sendMessage' },
        );
      });
    },
    start,
    stop,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    async isGroupAdmin(chatId: string, userId: string): Promise<boolean> {
      try {
        const member = await bot.api.getChatMember(chatId, Number(userId));
        return member.status === 'administrator' || member.status === 'creator';
      } catch (error) {
        logger.warn({ err: error, status: 'rejected', chatId }, 'Telegram isGroupAdmin lookup failed');
        return false;
      }
    },
  };
}
