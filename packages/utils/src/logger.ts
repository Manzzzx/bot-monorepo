import { join } from 'node:path';
import pino, {
  type LevelWithSilent,
  type Logger,
  type LoggerOptions,
  type TransportTargetOptions,
} from 'pino';
import { ulid } from 'ulid';

export type LoggerEnv = 'development' | 'production' | 'test';
export type RootLogLevel = LevelWithSilent;

export interface RootLoggerOptions {
  level?: RootLogLevel;
  env?: LoggerEnv;
  logDir?: string;
  noColor?: boolean;
}

function defaultLevel(env: LoggerEnv): RootLogLevel {
  if (env === 'development') return 'debug';
  if (env === 'test') return 'silent';
  return 'info';
}

export function createRootLogger(options: RootLoggerOptions = {}): Logger {
  const env = options.env ?? 'development';
  const level = options.level ?? defaultLevel(env);
  const logDir = options.logDir ?? '/home/container/data/log';
  const noColor = options.noColor ?? false;

  const targets: TransportTargetOptions[] = [];

  if (env !== 'test') {
    targets.push({
      target: 'pino-pretty',
      level,
      options: {
        colorize: !noColor,
        singleLine: env === 'production',
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat:
          '[{platform}] {feature} {status} → {msg} traceId={traceId} eventId={eventId}',
      },
    });
    targets.push({
      target: 'pino-roll',
      level,
      options: {
        file: join(logDir, 'bot.log'),
        frequency: 'daily',
        size: '50m',
        mkdir: true,
        limit: { count: 14 },
      },
    });
  }

  const baseOptions: LoggerOptions = {
    level,
    mixin() {
      return { eventId: ulid(), status: 'ok' };
    },
    mixinMergeStrategy(mergeObject, mixinObject) {
      return { ...mixinObject, ...mergeObject };
    },
    redact: {
      paths: [
        '*.password',
        '*.token',
        'env.AUTH_ENCRYPTION_KEY',
        'env.TELEGRAM_BOT_TOKEN',
        'config.AUTH_ENCRYPTION_KEY',
        'config.TELEGRAM_BOT_TOKEN',
      ],
      remove: true,
    },
  };

  if (targets.length === 0) {
    return pino(baseOptions);
  }

  return pino(baseOptions, pino.transport({ targets }));
}

export async function flushLogs(logger: Logger, timeoutMs = 2_000): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve, reject) => logger.flush((err) => (err ? reject(err) : resolve()))),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('log flush timeout')), timeoutMs),
    ),
  ]);
}
