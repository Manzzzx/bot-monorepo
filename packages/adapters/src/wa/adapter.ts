import { Boom } from '@hapi/boom';
import makeWASocket, { DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import type { Logger } from 'pino';
import type { AppContext, MessageAdapter, MessageCtx, Platform, ReplyOpts } from '@bot/contracts';
import type { AppPrismaClient } from '@bot/db';
import { makePrismaAuthState, type PrismaAuthStateHandle } from './auth-state.js';
import { GroupAdminCache } from '../group-admin-cache.js';
import { createWaMessageCtx, isUserMessage } from './context.js';

const PLATFORM: Platform = 'wa';
const MAX_BACKOFF_MS = 60_000;

export interface WaAdapterOptions {
  app: Pick<AppContext, 'config' | 'logger' | 'rateLimit' | 'bus'>;
  prisma: AppPrismaClient;
  onMessage(ctx: MessageCtx): Promise<void> | void;
}

export interface WaAdapter extends MessageAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  isGroupAdmin(chatId: string, userId: string): Promise<boolean>;
}

export function createWaAdapter(options: WaAdapterOptions): WaAdapter {
  const { app, prisma, onMessage } = options;
  const logger = app.logger.child({ adapter: 'wa' });

  const adminCache = new GroupAdminCache();
  let socket: WASocket | null = null;
  let auth: PrismaAuthStateHandle | null = null;
  let started = false;
  let paused = false;
  let stopping = false;
  let attempts = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function backoffDelay(): number {
    return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(attempts, 6));
  }

  async function buildSocket(): Promise<WASocket> {
    if (!auth) {
      auth = await makePrismaAuthState({
        prisma,
        encryptionKey: app.config.AUTH_ENCRYPTION_KEY,
      });
    }

    const sock = makeWASocket({
      auth: auth.state,
      logger: logger as unknown as NonNullable<Parameters<typeof makeWASocket>[0]['logger']>,
    });

    sock.ev.on('creds.update', () => {
      void auth?.saveCreds();
    });

    sock.ev.on('connection.update', (update) => {
      if (update.qr) {
        logger.info({ status: 'ok' }, 'WA pairing QR received, scan it now');
        qrcode.generate(update.qr, { small: true });
      }

      if (update.connection === 'open') {
        attempts = 0;
        app.bus.emit('connection.ready', { platform: PLATFORM });
        logger.info({ status: 'ok' }, 'WA connection ready');
        return;
      }

      if (update.connection === 'close') {
        const error = update.lastDisconnect?.error;
        const statusCode =
          error instanceof Boom
            ? error.output?.statusCode
            : (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        app.bus.emit('connection.lost', { platform: PLATFORM, statusCode });

        if (statusCode === DisconnectReason.loggedOut) {
          logger.error({ status: 'error' }, 'WA logged out (terminal); not reconnecting');
          return;
        }

        if (stopping || paused || !started) return;
        scheduleReconnect();
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        if (!isUserMessage(message)) continue;
        const ctx = createWaMessageCtx({ socket: sock, app, logger }, message);
        try {
          await onMessage(ctx);
        } catch (error) {
          logger.error({ err: error, status: 'error' }, 'WA onMessage handler failed');
        }
      }
    });

    return sock;
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || stopping) return;
    const delay = backoffDelay();
    attempts += 1;
    logger.warn({ delay, attempts, status: 'rejected' }, 'WA reconnecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    try {
      socket = await buildSocket();
    } catch (error) {
      logger.error({ err: error, status: 'error' }, 'WA connect failed');
      if (!stopping && started && !paused) scheduleReconnect();
    }
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    stopping = false;
    paused = false;
    await connect();
  }

  async function stop(): Promise<void> {
    stopping = true;
    started = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      socket?.end(undefined);
    } catch (error) {
      logger.warn({ err: error, status: 'rejected' }, 'WA stop ended with error');
    }
    socket = null;
  }

  function pause(): void {
    paused = true;
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    if (started && !socket) void connect();
  }

  async function isGroupAdmin(chatId: string, userId: string): Promise<boolean> {
    if (!socket) return false;
    if (!chatId.endsWith('@g.us')) return false;
    const cached = adminCache.get(chatId, userId);
    if (cached !== undefined) return cached;
    try {
      const meta = (await socket.groupMetadata(chatId)) as {
        participants?: Array<{ id?: string; admin?: string | null }>;
      };
      const participants = meta.participants ?? [];
      for (const p of participants) {
        if (typeof p.id !== 'string') continue;
        const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
        adminCache.set(chatId, p.id, isAdmin);
      }
      return adminCache.get(chatId, userId) ?? false;
    } catch (error) {
      logger.warn({ err: error, status: 'rejected', chatId }, 'WA isGroupAdmin lookup failed');
      return false;
    }
  }

  return {
    platform: PLATFORM,
    async sendMessage(chatId: string, text: string, opts?: ReplyOpts): Promise<void> {
      if (!socket) throw new Error('WA adapter is not connected.');
      const sock = socket;
      await app.rateLimit.outbound(PLATFORM, chatId).schedule(async () => {
        const content: Parameters<WASocket['sendMessage']>[1] =
          opts?.media && 'buffer' in opts.media ? buildMediaContent(opts.media, text) : { text };
        await sock.sendMessage(chatId, content);
      });
    },
    start,
    stop,
    pause,
    resume,
    isGroupAdmin,
  };
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

// Pin unused logger import for type safety in declarations.
export type { Logger };
