import type { Middleware } from '@bot/contracts';
import { GuardRejection } from '../errors.js';

export function requireGroup(): Middleware {
  return async function groupGuard(ctx, next) {
    if (!ctx.isGroup) throw new GuardRejection('Group only command.');
    await next();
  };
}
