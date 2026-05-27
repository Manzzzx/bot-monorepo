import type { AppContext } from './app-context.js';
import type { MessageCtx } from './message-ctx.js';

export type FeatureCategory = 'general' | 'owner' | 'group' | 'downloader' | 'stalker';

export type EventName =
  | 'message'
  | 'group.join'
  | 'group.leave'
  | 'group.update'
  | 'connection.ready'
  | 'connection.lost'
  | 'reminder.fire';

export type Middleware = (ctx: MessageCtx, next: () => Promise<void>) => Promise<void>;

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  examples?: string[];
  category?: FeatureCategory;
  guards?: Middleware[];
  handler(ctx: MessageCtx): Promise<void>;
}

export interface EventSubscription {
  event: EventName;
  handler(payload: unknown, app: AppContext): Promise<void>;
}

export interface Feature {
  name: string;
  version: string;
  commands?: Command[];
  events?: EventSubscription[];
  middleware?: Middleware[];
  onLoad?(app: AppContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}
