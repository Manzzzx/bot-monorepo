import type { PrismaRepoClient } from '../client.js';
import type { Platform } from './user-repo.js';

export const groupRepo = {
  getOrCreate(prisma: PrismaRepoClient, platform: Platform, externalId: string) {
    return prisma.group.upsert({
      where: {
        platform_externalId: { platform, externalId },
      },
      update: {},
      create: {
        platform,
        externalId,
        config: { create: {} },
      },
      include: { config: true },
    });
  },
};
