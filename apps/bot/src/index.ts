import { createRootLogger, flushLogs } from '@bot/utils';
import { bootstrap } from './bootstrap.js';
import { installSignalHandlers } from './shutdown.js';

async function main(): Promise<void> {
  const result = await bootstrap();
  installSignalHandlers({
    logger: result.app.logger,
    prisma: result.prisma,
    scheduler: result.scheduler,
    adapters: result.adapters,
  });
}

main().catch(async (error) => {
  const logger = createRootLogger({
    env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });
  logger.fatal({ status: 'fatal', err: error }, 'Bot failed to start');
  await flushLogs(logger).catch(() => undefined);
  process.exit(1);
});
