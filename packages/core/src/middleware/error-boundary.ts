import { flushLogs } from '@bot/utils';
import type { AppContext, Middleware } from '@bot/contracts';
import { UserFacingError } from '../errors.js';

export function errorBoundary(app: Pick<AppContext, 'logger'>): Middleware {
  return async function errorBoundaryMiddleware(ctx, next) {
    try {
      await next();
    } catch (error) {
      if (error instanceof UserFacingError) {
        ctx.logger.warn({ err: error, status: 'rejected', traceId: ctx.traceId }, error.message);
        await ctx.reply(error.userMessage);
        return;
      }

      const normalized = error instanceof Error ? error : new Error(String(error));
      app.logger.error(
        { err: normalized, status: 'error', traceId: ctx.traceId },
        'Unhandled bot error',
      );

      try {
        await flushLogs(app.logger);
      } catch (flushError) {
        app.logger.warn(
          { err: flushError, status: 'error', traceId: ctx.traceId },
          'Failed to flush logs',
        );
      }

      await ctx.reply(`Internal error. Trace: ${ctx.traceId}`);
    }
  };
}
