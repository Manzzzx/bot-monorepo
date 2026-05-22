import { Bot, type Context as GrammyContext } from 'grammy';
import type { AppContext, MessageAdapter, MessageCtx, Platform, ReplyOpts } from '@bot/contracts';
import { createTeleMessageCtx, hasUserMessage } from './context.js';

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
      await app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        if (opts?.media && 'buffer' in opts.media) {
          const grammy = await import('grammy');
          const inputFile = new grammy.InputFile(opts.media.buffer, opts.media.filename ?? 'file');
          if (opts.media.mimeType.startsWith('image/')) {
            await bot.api.sendPhoto(chatId, inputFile, { caption: text });
            return;
          }
          if (opts.media.mimeType.startsWith('video/')) {
            await bot.api.sendVideo(chatId, inputFile, { caption: text });
            return;
          }
          if (opts.media.mimeType.startsWith('audio/')) {
            await bot.api.sendAudio(chatId, inputFile, { caption: text });
            return;
          }
          await bot.api.sendDocument(chatId, inputFile, { caption: text });
          return;
        }
        await bot.api.sendMessage(chatId, text);
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
  };
}
