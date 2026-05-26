import { ulid } from 'ulid';
import type { Middleware } from '@bot/contracts';

export function withTraceId(): Middleware {
  return async function traceIdMiddleware(ctx, next) {
    ctx.traceId = ctx.traceId || ulid();
    ctx.logger = ctx.logger.child({
      traceId: ctx.traceId,
      platform: ctx.platform,
      chatType: ctx.chatType,
      chatId: ctx.chatId,
      ...(ctx.chatName ? { chatName: ctx.chatName } : {}),
      userId: ctx.userId,
      ...(ctx.userName ? { userName: ctx.userName } : {}),
    });
    await next();
  };
}