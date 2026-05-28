import type { AppContext } from './app-context.js';
import type { MessageCtx } from './message-ctx.js';
import type { Platform } from './platform.js';

export type FeatureCategory = 'general' | 'owner' | 'group' | 'downloader' | 'stalker';

export interface GroupJoinUser {
  id: string;
  name?: string;
}

export interface GroupJoinPayload {
  platform: Platform;
  chatId: string;
  groupId?: string;
  groupName?: string;
  userId?: string;
  userName?: string;
  users?: GroupJoinUser[];
}

export interface GroupLeavePayload {
  platform: Platform;
  chatId: string;
  userId: string;
  userName?: string;
}

export interface GroupUpdatePayload {
  platform: Platform;
  chatId: string;
  changes: Record<string, unknown>;
}

export interface ConnectionPayload {
  platform: Platform;
  statusCode?: number | undefined;
}

export interface ReminderFirePayload {
  id: string;
  chatId?: string;
  platform?: string;
  text?: string;
  status?: string;
}

export interface EventPayloads {
  message: MessageCtx;
  'group.join': GroupJoinPayload;
  'group.leave': GroupLeavePayload;
  'group.update': GroupUpdatePayload;
  'connection.ready': ConnectionPayload;
  'connection.lost': ConnectionPayload;
  'reminder.fire': ReminderFirePayload;
}

export type EventName = keyof EventPayloads;

export type Middleware<TRaw = unknown> = (
  ctx: MessageCtx<TRaw>,
  next: () => Promise<void>,
) => Promise<void>;

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

export type EventHandler<E extends EventName> = (
  payload: EventPayloads[E],
  app: AppContext,
) => Promise<void> | void;

export type EventSubscription<E extends EventName = EventName> = {
  [K in EventName]: { event: K; handler: EventHandler<K> };
}[E];

export type AnyEventSubscription = EventSubscription<EventName>;

export interface Feature {
  name: string;
  version: string;
  commands?: Command[];
  events?: AnyEventSubscription[];
  middleware?: Middleware[];
  onLoad?(app: AppContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}
