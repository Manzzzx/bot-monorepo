import type Bottleneck from 'bottleneck';
import type { Logger } from 'pino';
import type { Command, EventName, Feature, FeatureCategory } from './feature.js';
import type { ReplyOpts } from './message-ctx.js';
import type { Platform } from './platform.js';

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  NODE_ENV: NodeEnv;
  LOG_LEVEL: LogLevel;
  LOG_DIR: string;
  LOG_NO_COLOR: boolean;
  DATABASE_URL: string;
  AUTH_ENCRYPTION_KEY: string;
  WA_ENABLED: boolean;
  OWNER_WA?: string;
  WA_RATE_MIN_TIME_MS: number;
  TELE_ENABLED: boolean;
  TELEGRAM_BOT_TOKEN?: string;
  OWNER_TG?: string;
  TELE_RATE_MIN_TIME_MS: number;
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
  emit(event: EventName, payload: unknown): void;
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

export interface AppContext<TDb = unknown> {
  config: AppConfig;
  logger: Logger;
  db: TDb;
  bus: EventBus;
  scheduler: Scheduler;
  rateLimit: RateLimitRegistry;
  registry: CommandRegistry;
  adapters: AdapterRegistry;
}
