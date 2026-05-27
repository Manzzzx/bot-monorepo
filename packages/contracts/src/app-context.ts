import type Bottleneck from 'bottleneck';
import type { Logger } from 'pino';
import type { Command, EventName, Feature, FeatureCategory } from './feature.js';
import type { ReplyOpts } from './message-ctx.js';
import type { Platform } from './platform.js';

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type ProviderName = 'siputzx' | 'covenant';
export type ProviderSource = 'primary' | 'fallback';

export interface AppConfig {
  NODE_ENV: NodeEnv;
  TZ: string;
  LOG_LEVEL: LogLevel;
  LOG_DIR: string;
  LOG_NO_COLOR: boolean;
  LOG_PII: boolean;
  DATABASE_URL: string;
  AUTH_ENCRYPTION_KEY: string;
  WA_ENABLED: boolean;
  OWNER_WA?: string | undefined;
  WA_RATE_MIN_TIME_MS: number;
  TELE_ENABLED: boolean;
  TELEGRAM_BOT_TOKEN?: string | undefined;
  OWNER_TG?: string | undefined;
  TELE_RATE_MIN_TIME_MS: number;
  COVENANT_API_KEY?: string | undefined;
  PROVIDER_PRIMARY: ProviderName;
  PROVIDER_FALLBACK: ProviderName;
  PROVIDER_HTTP_TIMEOUT_MS: number;
  PROVIDER_RATE_MIN_TIME_MS: number;
  PROVIDER_MAX_CONCURRENT: number;
  PROVIDER_CIRCUIT_THRESHOLD: number;
  PROVIDER_CIRCUIT_COOLDOWN_MS: number;
  PROVIDER_DOWNLOAD_MAX_BYTES: number;
}

export interface MessageAdapter {
  platform: Platform;
  sendMessage(chatId: string, text: string, opts?: ReplyOpts): Promise<void>;
}

export interface AdapterRegistry {
  get(platform: Platform): MessageAdapter;
  has(platform: Platform): boolean;
}

export interface RegisteredCommand {
  command: Command;
  feature: Feature;
  category: FeatureCategory;
  fullName: string;
}

export interface CommandRegistry {
  register(feature: Feature, category: FeatureCategory): void;
  resolve(name: string): RegisteredCommand | null;
  list(): RegisteredCommand[];
  byCategory(): Record<FeatureCategory, RegisteredCommand[]>;
}

export interface EventBus {
  emit(event: EventName, payload: unknown): Promise<void> | void;
  on(event: EventName, handler: (payload: unknown, app: AppContext) => Promise<void> | void): void;
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
  scheduleOnce(at: Date, key: string, payload: unknown): Promise<void>;
}

export interface RateLimitRegistry {
  outbound(platform: Platform, chatId: string): Bottleneck;
}

export interface AppDownloadResult {
  type: 'video' | 'audio' | 'image' | 'document';
  url: string;
  title?: string | undefined;
  author?: string | undefined;
  caption?: string | undefined;
  durationSec?: number | undefined;
  thumbnailUrl?: string | undefined;
  sizeBytes?: number | undefined;
  source: ProviderSource;
}

export interface AppStalkerResult {
  username: string;
  displayName?: string | undefined;
  bio?: string | undefined;
  avatarUrl?: string | undefined;
  verified?: boolean | undefined;
  private?: boolean | undefined;
  followers?: number | undefined;
  following?: number | undefined;
  posts?: number | undefined;
  url?: string | undefined;
  extra?: Record<string, unknown> | undefined;
  source: ProviderSource;
}

export interface ProviderHubPort {
  download(service: string, query: { url: string }): Promise<AppDownloadResult>;
  stalk(service: string, query: { username: string }): Promise<AppStalkerResult>;
}

export interface AppContext<TDb = unknown> {
  config: AppConfig;
  logger: Logger;
  db: TDb;
  bus: EventBus;
  scheduler: Scheduler;
  rateLimit: RateLimitRegistry;
  registry: CommandRegistry;
  adapters: AdapterRegistry;
  providers: ProviderHubPort;
}