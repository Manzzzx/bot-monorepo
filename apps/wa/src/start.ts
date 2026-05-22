import { createWaAdapter, type WaAdapter } from '@bot/adapters';
import type { AppContext, MessageCtx } from '@bot/contracts';
import type { AppPrismaClient } from '@bot/db';

export interface RegisterWaOptions {
  app: AppContext<AppPrismaClient>;
  prisma: AppPrismaClient;
  onMessage(ctx: MessageCtx): Promise<void> | void;
}

export function registerWA(options: RegisterWaOptions): WaAdapter {
  const adapter = createWaAdapter({
    app: options.app,
    prisma: options.prisma,
    onMessage: options.onMessage,
  });
  const registry = options.app.adapters as { register?: (adapter: WaAdapter) => void };
  registry.register?.(adapter);
  return adapter;
}
