import type { Logger } from 'pino';
import { flushLogs } from '@bot/utils';
import type { TeleAdapter, WaAdapter } from '@bot/adapters';
import type { SchedulerImpl } from '@bot/core';
import type { AppPrismaClient } from '@bot/db';

export interface ShutdownOptions {
  logger: Logger;
  prisma: AppPrismaClient;
  scheduler: SchedulerImpl;
  adapters: { wa: WaAdapter | null; tele: TeleAdapter | null };
  inFlight?: () => Promise<void>;
  inFlightTimeoutMs?: number;
  exit?: (code: number) => void;
  /** Exit code to use when shutdown completes. Defaults to 0 (graceful). */
  exitCode?: number;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  logger: Logger,
): Promise<T | undefined> {
  return await Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      setTimeout(() => {
        logger.warn({ status: 'rejected', label }, `Timed out waiting for ${label} after ${ms}ms`);
        resolve(undefined);
      }, ms);
    }),
  ]);
}

export async function performShutdown(options: ShutdownOptions): Promise<void> {
  const { logger, prisma, scheduler, adapters } = options;
  const inFlightTimeoutMs = options.inFlightTimeoutMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const exitCode = options.exitCode ?? 0;

  logger.info({ status: 'ok', exitCode }, 'Shutdown initiated');

  adapters.wa?.pause();
  adapters.tele?.pause();

  await scheduler.stop();

  if (options.inFlight) {
    await withTimeout(Promise.resolve(options.inFlight()), inFlightTimeoutMs, 'in-flight', logger);
  }

  try {
    await adapters.wa?.stop();
  } catch (error) {
    logger.warn({ err: error, status: 'rejected' }, 'WA adapter stop failed');
  }
  try {
    await adapters.tele?.stop();
  } catch (error) {
    logger.warn({ err: error, status: 'rejected' }, 'Telegram adapter stop failed');
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.warn({ err: error, status: 'rejected' }, 'Prisma disconnect failed');
  }

  try {
    await flushLogs(logger);
  } catch (error) {
    logger.warn({ err: error, status: 'rejected' }, 'Log flush failed');
  }

  exit(exitCode);
}

export interface InstallSignalHandlersOptions extends ShutdownOptions {
  signals?: NodeJS.Signals[];
}

export function installSignalHandlers(options: InstallSignalHandlersOptions): () => void {
  const signals = options.signals ?? (['SIGTERM', 'SIGINT'] as NodeJS.Signals[]);
  let triggered = false;

  const handler = (signal: NodeJS.Signals) => {
    if (triggered) return;
    triggered = true;
    options.logger.info({ status: 'ok', signal }, `Received ${signal}, shutting down`);
    void performShutdown({ ...options, exitCode: 0 });
  };

  const onUncaught = (error: unknown) => {
    options.logger.fatal(
      { err: error, status: 'fatal' },
      'Uncaught exception, initiating shutdown',
    );
    if (triggered) return;
    triggered = true;
    void performShutdown({ ...options, exitCode: 1 });
  };

  const onUnhandled = (reason: unknown) => {
    options.logger.fatal(
      { err: reason, status: 'fatal' },
      'Unhandled rejection, initiating shutdown',
    );
    if (triggered) return;
    triggered = true;
    void performShutdown({ ...options, exitCode: 1 });
  };

  for (const signal of signals) process.on(signal, handler);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  return () => {
    for (const signal of signals) process.off(signal, handler);
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUnhandled);
  };
}
