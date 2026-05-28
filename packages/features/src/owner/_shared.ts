import type { AppContext, MessageCtx } from '@bot/contracts';
import { appFromCtx as coreAppFromCtx } from '@bot/core';

export type OwnerApp<TDb = unknown> = AppContext<TDb>;
export type OwnerBoundCtx<TDb = unknown> = MessageCtx & { app?: OwnerApp<TDb> };

export function appFromCtx<TDb = unknown>(ctx: MessageCtx): OwnerApp<TDb> {
  return coreAppFromCtx<TDb>(ctx);
}
