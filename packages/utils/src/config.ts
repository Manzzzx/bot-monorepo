import { z } from 'zod';
import type { AppConfig as ContractAppConfig } from '@bot/contracts';

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

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const tzSchema = z
  .string()
  .default('Asia/Jakarta')
  .refine(isValidTimezone, {
    message: 'Invalid IANA timezone. Examples: Asia/Jakarta, Asia/Singapore, UTC, America/New_York.',
  });

export const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(nodeEnvValues).default('development'),
    TZ: tzSchema,
    LOG_LEVEL: z.enum(logLevelValues).default('info'),
    LOG_DIR: z.string().default('./data/log'),
    LOG_NO_COLOR: booleanSchema.default(false),
    LOG_PII: booleanSchema.default(false),
    DATABASE_URL: z.string().default('file:./data/bot.db'),
    AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/, '32-byte hex required'),
    WA_ENABLED: booleanSchema.default(true),
    OWNER_WA: optionalNonEmptyString,
    WA_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(800),
    TELE_ENABLED: booleanSchema.default(true),
    TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
    OWNER_TG: optionalNonEmptyString,
    TELE_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(50),
    COVENANT_API_KEY: optionalNonEmptyString,
    PROVIDER_PRIMARY: z.enum(['siputzx', 'covenant']).default('siputzx'),
    PROVIDER_FALLBACK: z.enum(['siputzx', 'covenant']).default('covenant'),
    PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    PROVIDER_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(250),
    PROVIDER_MAX_CONCURRENT: z.coerce.number().int().positive().default(4),
    PROVIDER_CIRCUIT_THRESHOLD: z.coerce.number().int().positive().default(5),
    PROVIDER_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(60000),
    PROVIDER_DOWNLOAD_MAX_BYTES: z.coerce.number().int().positive().default(104857600),
  })
  .superRefine((config, ctx) => {
    if (config.TELE_ENABLED && !config.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_BOT_TOKEN'],
        message: 'TELEGRAM_BOT_TOKEN is required when TELE_ENABLED=true',
      });
    }
    if (config.PROVIDER_PRIMARY === config.PROVIDER_FALLBACK) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROVIDER_FALLBACK'],
        message: 'PROVIDER_PRIMARY and PROVIDER_FALLBACK must differ',
      });
    }
  });

// Compile-time guard: zod schema output must satisfy the AppConfig contract.
type _SchemaMatchesContract = z.infer<typeof ConfigSchema> extends ContractAppConfig
  ? ContractAppConfig extends z.infer<typeof ConfigSchema>
    ? true
    : false
  : false;
const _typeCheck: _SchemaMatchesContract = true;
void _typeCheck;

export type AppConfig = ContractAppConfig;
export type ConfigEnv = Record<string, string | boolean | number | undefined>;

export function loadConfig(env: ConfigEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export function getConfigWarnings(
  config: Pick<AppConfig, 'WA_ENABLED' | 'OWNER_WA' | 'TELE_ENABLED' | 'OWNER_TG' | 'COVENANT_API_KEY'>,
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

  if (!config.COVENANT_API_KEY) {
    warnings.push(
      'COVENANT_API_KEY missing; covenant provider disabled, downloader/stalker fallback unavailable.',
    );
  }

  return warnings;
}
