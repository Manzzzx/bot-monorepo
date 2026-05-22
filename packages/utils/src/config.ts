import { z } from 'zod';

export const nodeEnvValues = ['development', 'production', 'test'] as const;
export const logLevelValues = ['trace', 'debug', 'info', 'warn', 'error'] as const;

const booleanSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}, z.string().optional());

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(nodeEnvValues).default('development'),
    LOG_LEVEL: z.enum(logLevelValues).default('info'),
    LOG_DIR: z.string().default('/home/container/data/log'),
    LOG_NO_COLOR: booleanSchema.default(false),
    DATABASE_URL: z.string().default('file:/home/container/data/bot.db'),
    AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/, '32-byte hex required'),
    WA_ENABLED: booleanSchema.default(true),
    OWNER_WA: optionalNonEmptyString,
    WA_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(800),
    TELE_ENABLED: booleanSchema.default(true),
    TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
    OWNER_TG: optionalNonEmptyString,
    TELE_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(50),
  })
  .superRefine((config, ctx) => {
    if (config.TELE_ENABLED && !config.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'TELEGRAM_BOT_TOKEN is required when TELE_ENABLED=true',
      });
    }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;
export type ConfigEnv = Record<string, string | boolean | number | undefined>;

export function loadConfig(env: ConfigEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export function getConfigWarnings(
  config: Pick<AppConfig, 'WA_ENABLED' | 'OWNER_WA' | 'TELE_ENABLED' | 'OWNER_TG'>,
): string[] {
  const warnings: string[] = [];

  if (config.WA_ENABLED && !config.OWNER_WA) {
    warnings.push('WA_ENABLED=true but OWNER_WA is missing; WA owner commands will be disabled.');
  }

  if (config.TELE_ENABLED && !config.OWNER_TG) {
    warnings.push(
      'TELE_ENABLED=true but OWNER_TG is missing; Telegram owner commands will be disabled.',
    );
  }

  return warnings;
}
