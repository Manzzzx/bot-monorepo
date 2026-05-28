import { join } from 'node:path';
import pino, {
  multistream,
  type Level,
  type LevelWithSilent,
  type Logger,
  type LoggerOptions,
  type StreamEntry,
} from 'pino';
import pinoRoll from 'pino-roll';
import { ulid } from 'ulid';
import { createPrettyStream, type RenderOpts } from './log-pretty.js';

export type LoggerEnv = 'development' | 'production' | 'test';
export type RootLogLevel = LevelWithSilent;

export interface RootLoggerOptions {
  level?: RootLogLevel;
  env?: LoggerEnv;
  logDir?: string;
  noColor?: boolean;
  logPii?: boolean;
  tz?: string;
}

interface FlushableStream {
  flushSync?(cb?: () => void): void;
  flush?(cb?: (err?: Error | null) => void): void;
}

const STREAMS_KEY = Symbol.for('@bot/utils/logger/streams');

interface LoggerWithStreams extends Logger {
  [STREAMS_KEY]?: FlushableStream[];
}

function defaultLevel(env: LoggerEnv): RootLogLevel {
  if (env === 'development') return 'debug';
  if (env === 'test') return 'silent';
  return 'info';
}

function streamLevel(level: RootLogLevel): Level {
  if (level === 'silent') return 'info';
  return level;
}

const REDACT_PATHS = [
  '*.password',
  '*.token',
  '*.authorization',
  '*.cookie',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.bearer',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.privateKey',
  '*.private_key',
  '*.creds',
  '*.credentials',
  '*.signedIdentityKey',
  '*.noiseKey',
  '*.encryptedBlob',
  '*.iv',
  '*.authTag',
  'headers.authorization',
  'headers.cookie',
  'env.AUTH_ENCRYPTION_KEY',
  'env.TELEGRAM_BOT_TOKEN',
  'env.OWNER_WA',
  'env.OWNER_TG',
  'config.AUTH_ENCRYPTION_KEY',
  'config.TELEGRAM_BOT_TOKEN',
  'config.OWNER_WA',
  'config.OWNER_TG',
];

function buildBaseOptions(level: RootLogLevel): LoggerOptions {
  return {
    level,
    mixin() {
      return { eventId: ulid(), status: 'ok' };
    },
    mixinMergeStrategy(mergeObject, mixinObject) {
      return { ...mixinObject, ...mergeObject };
    },
    redact: { paths: REDACT_PATHS, remove: true },
  };
}

export async function createRootLogger(options: RootLoggerOptions = {}): Promise<Logger> {
  const env = options.env ?? 'development';
  const level = options.level ?? defaultLevel(env);
  const logDir = options.logDir ?? join(process.cwd(), 'data', 'log');
  const noColor = options.noColor ?? false;
  const logPii = options.logPii ?? false;
  const tz = options.tz ?? process.env.TZ ?? undefined;

  const baseOptions = buildBaseOptions(level);

  if (env === 'test') {
    return pino(baseOptions);
  }

  const renderOpts: RenderOpts = { color: !noColor, logPii, tz };
  const targetLevel = streamLevel(level);
  const streams: StreamEntry[] = [];
  const flushable: FlushableStream[] = [];

  const prettyStream = createPrettyStream(renderOpts);
  prettyStream.pipe(process.stdout);
  streams.push({ level: targetLevel, stream: prettyStream });

  try {
    const fileStream = (await pinoRoll({
      file: join(logDir, 'bot'),
      frequency: 'daily',
      mkdir: true,
      dateFormat: 'yyyy-MM-dd',
      extension: '.log',
      limit: { count: 7 },
    })) as FlushableStream & NodeJS.WritableStream;
    fileStream.on('error', (err: unknown) => {
      const payload = {
        time: Date.now(),
        level: 60,
        status: 'fatal',
        msg: 'pino-roll stream error; file log offline until restart',
        err:
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) },
      };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
    });
    streams.push({ level: targetLevel, stream: fileStream });
    flushable.push(fileStream);
  } catch (err) {
    const payload = {
      time: Date.now(),
      level: 60,
      status: 'fatal',
      msg: 'pino-roll init failed; running with stdout-only logger',
      err:
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { message: String(err) },
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
  }

  const logger = pino(baseOptions, multistream(streams, { dedupe: false }));
  Object.defineProperty(logger, STREAMS_KEY, {
    value: flushable,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return logger;
}

function flushSyncStream(stream: FlushableStream): void {
  if (typeof stream.flushSync !== 'function') return;
  try {
    stream.flushSync();
  } catch {
    // best effort
  }
}

export async function flushLogs(logger: Logger, timeoutMs = 2_000): Promise<void> {
  const streams = (logger as LoggerWithStreams)[STREAMS_KEY] ?? [];
  await Promise.race([
    (async () => {
      await new Promise<void>((resolve, reject) =>
        logger.flush((err) => (err ? reject(err) : resolve())),
      );
      for (const stream of streams) flushSyncStream(stream);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    })(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('log flush timeout')), timeoutMs),
    ),
  ]);
}
