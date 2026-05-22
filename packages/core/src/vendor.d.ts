declare module 'yargs-parser' {
  export interface ParsedArguments {
    _: Array<string | number>;
    [key: string]: unknown;
  }

  export interface ParserOptions {
    configuration?: Record<string, unknown>;
  }

  export default function yargsParser(
    args: string | string[],
    options?: ParserOptions,
  ): ParsedArguments;
}

declare module 'koa-compose' {
  export type ComposableMiddleware<TContext> = (
    context: TContext,
    next: () => Promise<void>,
  ) => Promise<void>;

  export default function compose<TContext>(
    middleware: Array<ComposableMiddleware<TContext>>,
  ): (context: TContext, next?: () => Promise<void>) => Promise<void>;
}
