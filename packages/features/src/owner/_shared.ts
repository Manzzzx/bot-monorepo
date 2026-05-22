import type { AppContext, MessageCtx } from '@bot/contracts';

export type OwnerApp<TDb = unknown> = AppContext<TDb> & {
  shutdown?: (reason?: string) => Promise<void> | void;
};

export type OwnerBoundCtx<TDb = unknown> = MessageCtx & { app?: OwnerApp<TDb> };

export function appFromCtx<TDb = unknown>(ctx: MessageCtx): OwnerApp<TDb> {
  const app = (ctx as OwnerBoundCtx<TDb>).app;
  if (!app) throw new Error('App context unavailable.');
  return app;
}
