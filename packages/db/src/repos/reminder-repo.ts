import type { Prisma } from '@prisma/client';
import type { AppPrismaClient, PrismaRepoClient } from '../client.js';

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const reminderRepo = {
  claimDue(prisma: AppPrismaClient, limit: number, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const candidates = await tx.reminder.findMany({
        where: {
          status: 'pending',
          dueAt: { lte: now },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });

      const claimed: Prisma.ReminderGetPayload<object>[] = [];

      for (const reminder of candidates) {
        const updated = await tx.reminder.updateMany({
          where: { id: reminder.id, status: 'pending' },
          data: { status: 'firing' },
        });

        if (updated.count !== 1) continue;

        const row = await tx.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
        claimed.push(row);
      }

      return claimed;
    });
  },

  claim(prisma: AppPrismaClient, id: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.reminder.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'firing' },
      });

      if (updated.count !== 1) return null;

      return tx.reminder.findUnique({ where: { id } });
    });
  },

  markDone(prisma: PrismaRepoClient, id: string) {
    return prisma.reminder.update({
      where: { id },
      data: { status: 'done', lastError: null },
    });
  },

  markFailed(prisma: PrismaRepoClient, id: string, error: unknown) {
    return prisma.reminder.update({
      where: { id },
      data: { status: 'failed', lastError: errorText(error) },
    });
  },

  incrementAttempt(prisma: PrismaRepoClient, id: string, error: unknown) {
    return prisma.reminder.update({
      where: { id },
      data: {
        status: 'pending',
        attemptCount: { increment: 1 },
        lastError: errorText(error),
      },
    });
  },
};
