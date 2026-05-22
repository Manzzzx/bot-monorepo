import { describe, expect, it } from 'vitest';
import { createIsolatedPrismaClient } from './test-db.test-helper.js';

describe('createPrismaClient', () => {
  it('enables SQLite WAL pragmas', async () => {
    const prisma = await createIsolatedPrismaClient();

    const rows =
      await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;');

    expect(rows[0]?.journal_mode).toBe('wal');
  });
});
