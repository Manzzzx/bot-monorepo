import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, type Prisma } from '@prisma/client';

export type AppPrismaClient = PrismaClient;
export type PrismaRepoClient = PrismaClient | Prisma.TransactionClient;

export interface CreatePrismaClientOptions {
  databaseUrl?: string;
  log?: Prisma.PrismaClientOptions['log'];
}

export async function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): Promise<PrismaClient> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create Prisma client');
  }

  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const clientOptions: Prisma.PrismaClientOptions = { adapter };
  if (options.log) {
    clientOptions.log = options.log;
  }
  const prisma = new PrismaClient(clientOptions);

  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');

  return prisma;
}
