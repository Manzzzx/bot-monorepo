import type { AppContext, Middleware } from '@bot/contracts';
import { UserFacingError } from '../errors.js';

export function errorBoundary(app: Pick<AppContext, 'logger'>): Middleware {
  return async function errorBoundaryMiddleware(ctx, next) {
    try {
      await next();
    } catch (error) {
      if (error instanceof UserFacingError) {
        ctx.logger.warn({ err: error, status: 'rejected', traceId: ctx.traceId }, error.message);
        try {
          await ctx.reply(error.userMessage);
        } catch (replyError) {
          ctx.logger.warn(
            { err: replyError, status: 'rejected', traceId: ctx.traceId },
            'Failed to reply with user-facing error',
          );
        }
        return;
      }

      const normalized = error instanceof Error ? error : new Error(String(error));
      app.logger.error(
        { err: normalized, status: 'error', traceId: ctx.traceId },
        'Unhandled bot error',
      );

      try {
        await ctx.reply(`Internal error. Please try again later.`);
      } catch (replyError) {
        app.logger.warn(
          { err: replyError, status: 'rejected', traceId: ctx.traceId },
          'Failed to send error reply',
        );
      }
    }
  };
}
