import { LRUCache } from 'lru-cache';
import type { MessageCtx, Middleware } from '@bot/contracts';
import { GuardRejection } from '../errors.js';

export type CooldownScope =
  | 'user'
  | 'chat'
  | 'command'
  | 'user-command'
  | 'chat-command'
  | 'global';

export interface CooldownOptions {
  ms: number;
  scope: CooldownScope;
  max?: number;
}

function scopeKey(ctx: MessageCtx, scope: CooldownScope): string {
  const command = ctx.command ?? 'unknown';

  switch (scope) {
    case 'user':
      return `user:${ctx.platform}:${ctx.userId}`;
    case 'chat':
      return `chat:${ctx.platform}:${ctx.chatId}`;
    case 'command':
      return `command:${command}`;
    case 'user-command':
      return `user-command:${ctx.platform}:${ctx.userId}:${command}`;
    case 'chat-command':
      return `chat-command:${ctx.platform}:${ctx.chatId}:${command}`;
    case 'global':
      return 'global';
  }
}

export function cooldown(options: CooldownOptions): Middleware {
  const cache = new LRUCache<string, number>({ max: options.max ?? 10_000 });

  return async function cooldownGuard(ctx, next) {
    const key = scopeKey(ctx, options.scope);
    const now = Date.now();
    const expiresAt = cache.get(key);

    if (expiresAt !== undefined && expiresAt > now) {
      const seconds = Math.ceil((expiresAt - now) / 1_000);
      throw new GuardRejection(`Cooldown active. Try again in ${seconds}s.`);
    }

    cache.set(key, now + options.ms);
    await next();
  };
}
