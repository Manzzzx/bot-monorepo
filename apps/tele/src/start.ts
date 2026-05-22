import { createTeleAdapter, type TeleAdapter } from '@bot/adapters';
import type { AppContext, MessageCtx } from '@bot/contracts';
import type { AppPrismaClient } from '@bot/db';

export interface RegisterTeleOptions {
  app: AppContext<AppPrismaClient>;
  onMessage(ctx: MessageCtx): Promise<void> | void;
}

export function registerTele(options: RegisterTeleOptions): TeleAdapter {
  const adapter = createTeleAdapter({
    app: options.app,
    onMessage: options.onMessage,
  });
  (options.app.adapters as { register?: (adapter: TeleAdapter) => void }).register?.(adapter);
  return adapter;
}
