import { describe, expect, it } from 'vitest';
import { createIsolatedPrismaClient } from '../test-db.test-helper.js';
import { groupRepo } from './group-repo.js';
import { userRepo } from './user-repo.js';

describe('userRepo', () => {
  it('upserts by platform and external id', async () => {
    const prisma = await createIsolatedPrismaClient();

    const first = await userRepo.upsertByExternal(prisma, 'wa', 'u-1');
    const second = await userRepo.upsertByExternal(prisma, 'wa', 'u-1');

    expect(second.id).toBe(first.id);
  });
});

describe('groupRepo', () => {
  it('gets or creates by platform and external id', async () => {
    const prisma = await createIsolatedPrismaClient();

    const first = await groupRepo.getOrCreate(prisma, 'tele', 'g-1');
    const second = await groupRepo.getOrCreate(prisma, 'tele', 'g-1');

    expect(second.id).toBe(first.id);
  });
});
