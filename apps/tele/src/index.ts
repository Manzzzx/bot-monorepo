import { bootstrap } from '@app/bot/bootstrap';
import { installSignalHandlers } from '@app/bot/shutdown';
import { createRootLogger, flushLogs } from '@bot/utils';

async function main(): Promise<void> {
  const result = await bootstrap({ startAdapters: false });
  if (!result.adapters.tele) {
    result.app.logger.warn(
      { status: 'rejected' },
      'Telegram disabled in config; nothing to start.',
    );
    return;
  }
  await result.adapters.tele.start();
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
  logger.fatal({ status: 'fatal', err: error }, 'Telegram app failed to start');
  await flushLogs(logger).catch(() => undefined);
  process.exit(1);
});
