import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createPrismaClient, type AppPrismaClient } from './client.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaPath = join(repoRoot, 'prisma/schema.prisma');
const clients: AppPrismaClient[] = [];

export async function createIsolatedPrismaClient(): Promise<AppPrismaClient> {
  const dir = await mkdtemp(join(tmpdir(), 'bot-db-'));
  const dbPath = join(dir, 'test.db').replaceAll('\\', '/');
  const databaseUrl = `file:${dbPath}`;
  const prismaCli = join(repoRoot, 'node_modules/prisma/build/index.js');

  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--schema', schemaPath], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });

  const prisma = await createPrismaClient({ databaseUrl });

  clients.push(prisma);
  return prisma;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
});
