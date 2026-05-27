import type { AppContext, MessageCtx, Middleware } from '@bot/contracts';
import { GuardRejection } from '../errors.js';

type AdminCheck = {
  isGroupAdmin?(chatId: string, userId: string): Promise<boolean>;
};

type AppBoundCtx = MessageCtx & { app?: Pick<AppContext, 'config' | 'adapters'> };

function ownerIdFor(ctx: MessageCtx, app: Pick<AppContext, 'config'>): string | undefined {
  return ctx.platform === 'wa' ? app.config.OWNER_WA : app.config.OWNER_TG;
}

/**
 * Permit when the user is a platform-side group admin. Falls back to bot owner
 * if the adapter does not implement `isGroupAdmin` (e.g. test stubs).
 */
export function requireGroupAdmin(): Middleware {
  return async function groupAdminGuard(ctx, next) {
    const app = (ctx as AppBoundCtx).app;
    if (!app) throw new GuardRejection('App context unavailable.');

    const adapter = app.adapters.get(ctx.platform) as unknown as AdminCheck;
    if (typeof adapter.isGroupAdmin === 'function') {
      const ok = await adapter.isGroupAdmin(ctx.chatId, ctx.userId).catch(() => false);
      if (ok) {
        await next();
        return;
      }
      const ownerId = ownerIdFor(ctx, app);
      if (ownerId && ctx.userId === ownerId) {
        await next();
        return;
      }
      throw new GuardRejection('Group admin only command.');
    }

    const ownerId = ownerIdFor(ctx, app);
    if (!ownerId || ctx.userId !== ownerId) throw new GuardRejection('Group admin only command.');
    await next();
  };
}
