import type Bottleneck from 'bottleneck';
import type { Logger } from 'pino';
import type {
  Command,
  EventHandler,
  EventName,
  EventPayloads,
  Feature,
  FeatureCategory,
} from './feature.js';
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
  /**
   * Master switch for the dangerous owner /eval command. Default false.
   * node:vm is NOT a security sandbox; even with requireOwner the surface
   * is too large to leave on by default. Flip to true only on dev hosts
   * where the operator fully trusts every owner identity in OWNER_WA/TG.
   */
  OWNER_EVAL_ENABLED: boolean;
}

export interface MessageAdapter {
  platform: Platform;
  sendMessage(chatId: string, text: string, opts?: ReplyOpts): Promise<void>;
  isGroupAdmin?(chatId: string, userId: string): Promise<boolean>;
}

export interface AdapterRegistry {
  register(adapter: MessageAdapter): void;
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
  emit<E extends EventName>(event: E, payload: EventPayloads[E]): Promise<void> | void;
  on<E extends EventName>(event: E, handler: EventHandler<E>): void;
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

export interface AppMediaBuffer {
  buffer: Buffer;
  mimeType: string;
}

export interface ProviderHubPort {
  download(service: string, query: { url: string }): Promise<AppDownloadResult>;
  stalk(
    service: string,
    query: { username: string; extra?: Record<string, string> },
  ): Promise<AppStalkerResult>;
  fetchMedia(url: string): Promise<AppMediaBuffer>;
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
  /** Optional shutdown hook bound by the host app (used by /shutdown command). */
  shutdown?: (reason?: string) => Promise<void> | void;
}
