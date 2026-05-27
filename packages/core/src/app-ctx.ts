import type { AppContext, MessageCtx } from '@bot/contracts';

export type AppBoundCtx<TDb = unknown> = MessageCtx & { app?: AppContext<TDb> };

/**
 * Extract the AppContext that the router attached to the inbound message.
 * Throws if a feature handler is invoked outside of the router pipeline
 * (e.g. tests must use `createMockCtx` and inject `app` manually).
 */
export function appFromCtx<TDb = unknown>(ctx: MessageCtx): AppContext<TDb> {
  const app = (ctx as AppBoundCtx<TDb>).app;
  if (!app) throw new Error('App context unavailable on MessageCtx; bound by router only.');
  return app;
}
