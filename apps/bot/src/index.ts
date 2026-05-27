import { createRootLogger, flushLogs } from '@bot/utils';
import { bootstrap } from './bootstrap.js';
import { installSignalHandlers, performShutdown } from './shutdown.js';

async function main(): Promise<void> {
  const result = await bootstrap();
  const shutdownOpts = {
    logger: result.app.logger,
    prisma: result.prisma,
    scheduler: result.scheduler,
    adapters: result.adapters,
  };
  result.setShutdown(async (reason) => {
    result.app.logger.info({ status: 'ok', reason }, 'Shutdown requested via app.shutdown');
    await performShutdown({ ...shutdownOpts, exitCode: 0 });
  });
  installSignalHandlers(shutdownOpts);
}

main().catch(async (error) => {
  const logger = await createRootLogger({
    env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });
  logger.fatal({ status: 'fatal', err: error }, 'Bot failed to start');
  await flushLogs(logger).catch(() => undefined);
  process.exit(1);
});
