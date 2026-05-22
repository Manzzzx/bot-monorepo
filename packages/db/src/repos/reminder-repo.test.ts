import { describe, expect, it } from 'vitest';
import { createIsolatedPrismaClient } from '../test-db.test-helper.js';
import { reminderRepo } from './reminder-repo.js';
import { userRepo } from './user-repo.js';

describe('reminderRepo', () => {
  it('claims due reminders once across parallel calls', async () => {
    const prisma = await createIsolatedPrismaClient();
    const now = new Date();
    const user = await userRepo.upsertByExternal(prisma, 'wa', 'user-1');

    await prisma.reminder.create({
      data: {
        userId: user.id,
        chatId: 'chat-1',
        platform: 'wa',
        text: 'wake up',
        dueAt: new Date(now.getTime() - 1_000),
      },
    });

    const [first, second] = await Promise.all([
      reminderRepo.claimDue(prisma, 10, now),
      reminderRepo.claimDue(prisma, 10, now),
    ]);

    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('firing');

    const pending = await prisma.reminder.count({ where: { status: 'pending' } });
    expect(pending).toBe(0);
  });

  it('claim(id) returns row exactly once across parallel calls', async () => {
    const prisma = await createIsolatedPrismaClient();
    const user = await userRepo.upsertByExternal(prisma, 'wa', 'user-race');

    const row = await prisma.reminder.create({
      data: {
        userId: user.id,
        chatId: 'chat-race',
        platform: 'wa',
        text: 'race me',
        dueAt: new Date(),
      },
    });

    const [first, second] = await Promise.all([
      reminderRepo.claim(prisma, row.id),
      reminderRepo.claim(prisma, row.id),
    ]);

    const winners = [first, second].filter((value) => value !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.status).toBe('firing');

    const reread = await prisma.reminder.findUnique({ where: { id: row.id } });
    expect(reread?.status).toBe('firing');
  });

  it('claim(id) returns null for non-pending reminders', async () => {
    const prisma = await createIsolatedPrismaClient();
    const user = await userRepo.upsertByExternal(prisma, 'wa', 'user-claimed');

    const row = await prisma.reminder.create({
      data: {
        userId: user.id,
        chatId: 'chat-claimed',
        platform: 'wa',
        text: 'already claimed',
        dueAt: new Date(),
        status: 'firing',
      },
    });

    const result = await reminderRepo.claim(prisma, row.id);
    expect(result).toBeNull();
  });

  it('updates reminder lifecycle states', async () => {
    const prisma = await createIsolatedPrismaClient();
    const user = await userRepo.upsertByExternal(prisma, 'tele', 'user-2');
    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        chatId: 'chat-2',
        platform: 'tele',
        text: 'retry me',
        dueAt: new Date(),
      },
    });

    const retry = await reminderRepo.incrementAttempt(prisma, reminder.id, new Error('busy'));
    expect(retry).toMatchObject({ status: 'pending', attemptCount: 1, lastError: 'busy' });

    const failed = await reminderRepo.markFailed(prisma, reminder.id, 'dead');
    expect(failed).toMatchObject({ status: 'failed', lastError: 'dead' });

    const done = await reminderRepo.markDone(prisma, reminder.id);
    expect(done).toMatchObject({ status: 'done', lastError: null });
  });
});
