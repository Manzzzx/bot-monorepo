import type { AppContext, MessageCtx, Middleware } from '@bot/contracts';
import { GuardRejection } from '../errors.js';

type OwnerConfigApp = Pick<AppContext, 'config'>;
type AppBoundMessageCtx = MessageCtx & { app?: OwnerConfigApp };

function ownerIdFor(ctx: MessageCtx, app: OwnerConfigApp): string | undefined {
  return ctx.platform === 'wa' ? app.config.OWNER_WA : app.config.OWNER_TG;
}

export function requireOwner(app?: OwnerConfigApp): Middleware {
  return async function ownerGuard(ctx, next) {
    const resolvedApp = app ?? (ctx as AppBoundMessageCtx).app;
    if (!resolvedApp) throw new GuardRejection('Owner config unavailable.');

    const ownerId = ownerIdFor(ctx, resolvedApp);
    if (!ownerId || ctx.userId !== ownerId) throw new GuardRejection('Owner only command.');

    await next();
  };
}
