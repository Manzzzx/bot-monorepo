import compose from 'koa-compose';
import type { AppContext, MessageCtx, Middleware, RegisteredCommand } from '@bot/contracts';
import { errorBoundary } from './middleware/error-boundary.js';
import { withTraceId } from './middleware/with-trace-id.js';
import { parseInput } from './parser.js';

export interface Router {
  dispatch(ctx: MessageCtx): Promise<void>;
}

export interface RouterOptions {
  unknownCommand?: 'reply' | 'ignore';
}

type RouterCtx = MessageCtx & {
  app: AppContext;
  matchedCommand?: RegisteredCommand;
};

type RouterMiddleware = (ctx: RouterCtx, next: () => Promise<void>) => Promise<void>;

function asRouterMiddleware(middleware: Middleware): RouterMiddleware {
  return middleware as RouterMiddleware;
}

function commandPipeline(registered: RegisteredCommand): RouterMiddleware[] {
  return [
    ...(registered.feature.middleware ?? []).map(asRouterMiddleware),
    ...(registered.command.guards ?? []).map(asRouterMiddleware),
    async (ctx) => {
      await registered.command.handler(ctx);
    },
  ];
}

export function createRouter(app: AppContext, options: RouterOptions = {}): Router {
  const unknownCommand = options.unknownCommand ?? 'reply';

  return {
    async dispatch(ctx: MessageCtx): Promise<void> {
      const routerCtx = ctx as RouterCtx;
      routerCtx.app = app;

      const pipeline = compose<RouterCtx>([
        asRouterMiddleware(errorBoundary(app)),
        asRouterMiddleware(withTraceId()),
        async (currentCtx, next) => {
          currentCtx.logger.info(
            {
              status: 'ok',
              platform: currentCtx.platform,
              chatId: currentCtx.chatId,
              userId: currentCtx.userId,
              isGroup: currentCtx.isGroup,
              text: currentCtx.text.slice(0, 120),
            },
            'inbound message',
          );
          await next();
        },
        async (currentCtx, next) => {
          const parsed = parseInput(currentCtx.text);
          if (!parsed) {
            await Promise.resolve(app.bus.emit('message', currentCtx));
            return;
          }

          currentCtx.command = parsed.command;
          currentCtx.args = parsed.args;
          currentCtx.flags = parsed.flags;
          await next();
        },
        async (currentCtx) => {
          const commandName = currentCtx.command;
          if (!commandName) return;

          const registered = app.registry.resolve(commandName);
          if (!registered) {
            if (unknownCommand === 'reply')
              await currentCtx.reply(`Unknown command: ${commandName}`);
            currentCtx.logger.info(
              { status: 'rejected', command: commandName },
              'command not found',
            );
            return;
          }

          currentCtx.matchedCommand = registered;
          currentCtx.logger.info(
            {
              status: 'ok',
              command: registered.command.name,
              feature: registered.feature.name,
              category: registered.category,
            },
            'command matched',
          );
          await compose<RouterCtx>(commandPipeline(registered))(currentCtx);
          currentCtx.logger.info(
            { status: 'ok', command: registered.command.name },
            'command done',
          );
        },
      ]);

      await pipeline(routerCtx);
    },
  };
}
