import type { PrismaRepoClient } from '../client.js';

export type Platform = 'wa' | 'tele';

export const userRepo = {
  upsertByExternal(prisma: PrismaRepoClient, platform: Platform, externalId: string) {
    return prisma.user.upsert({
      where: {
        platform_externalId: { platform, externalId },
      },
      update: {},
      create: { platform, externalId },
    });
  },
};
