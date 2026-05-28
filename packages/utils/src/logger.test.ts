import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRootLogger, flushLogs } from './logger.js';

async function readLogRecords(logDir: string): Promise<Array<Record<string, unknown>>> {
  const files = await readdir(logDir);
  const logFile = files.find((file) => file.endsWith('.log'));
  if (!logFile) return [];

  const content = await readFile(join(logDir, logFile), 'utf8');
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('createRootLogger', () => {
  it('writes a JSON file event with eventId, status, and traceId', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'bot-logs-'));
    const logger = await createRootLogger({
      level: 'info',
      env: 'production',
      logDir,
      noColor: true,
    });

    logger.info({ traceId: 'trace-1', platform: 'wa', feature: 'general/ping' }, 'handled');
    await flushLogs(logger);

    const records = await readLogRecords(logDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ traceId: 'trace-1', status: 'ok', msg: 'handled' });
    expect(records[0]?.eventId).toEqual(expect.any(String));
  });

  it('flushes error and fatal paths', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'bot-logs-'));
    const logger = await createRootLogger({
      level: 'info',
      env: 'production',
      logDir,
      noColor: true,
    });

    logger.error({ traceId: 'trace-error', status: 'error' }, 'recoverable');
    logger.fatal({ traceId: 'trace-fatal', status: 'fatal' }, 'unrecoverable');

    await expect(flushLogs(logger)).resolves.toBeUndefined();
  });
});
