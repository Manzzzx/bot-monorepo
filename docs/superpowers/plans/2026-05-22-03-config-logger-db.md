# Config Logger DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement config loading, logger fan-out, crypto helpers, SQLite Prisma schema/client, and repositories.

**Architecture:** Utils own cross-cutting services. DB owns Prisma client and WAL setup. Logger must guarantee same `eventId` reaches terminal and file.

**Tech Stack:** zod, pino, pino-pretty, pino-roll, ulid, Prisma SQLite, Node crypto.

---

## Files

- Create: `packages/utils/src/{config,logger,crypto,time}.ts`
- Create: `prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/repos/{user-repo,group-repo,reminder-repo}.ts`
- Tests: config, logger, crypto, time, db client, reminder repo

## Task 1: Config

- [ ] Add deps: `npm install zod pino pino-pretty pino-roll ulid @prisma/client && npm install -D prisma`.
- [ ] Implement `loadConfig(env=process.env)` with zod fields from `docs/tech-spec.md` §13.
- [ ] Cross-validate: `TELE_ENABLED && !TELEGRAM_BOT_TOKEN` throws; missing owner IDs warn later via logger.
- [ ] Test invalid encryption key, missing telegram token, defaults.

## Task 2: Logger

- [ ] Implement `createRootLogger({ level, env, logDir, noColor })` in `packages/utils/src/logger.ts`.
- [ ] Use pino transport targets: stdout `pino-pretty`, file `pino-roll`.
- [ ] Add `mixin()` returning `{ eventId: ulid(), status: 'ok' }`.
- [ ] Production message format: `[{platform}] {feature} {status} → {msg} traceId={traceId} eventId={eventId}`.
- [ ] Implement `flushLogs(logger, timeoutMs=2000)`.
- [ ] Test: one log event writes JSON file with `eventId`, `status`, `traceId`; error/fatal flush path completes.

## Task 3: Crypto + time

- [ ] Implement AES-256-GCM helpers: `encryptJson(value, hexKey)` returns `{ encryptedBlob, iv, authTag }`; `decryptJson<T>(payload, hexKey)` returns parsed JSON.
- [ ] Test roundtrip + wrong key failure.
- [ ] Implement `parseDuration('1h30m')` supporting `s`, `m`, `h`, `d` combinations.
- [ ] Test invalid duration, empty string, combined duration.

## Task 4: Prisma schema + WAL client

- [ ] Write `prisma/schema.prisma` with models `User`, `Group`, `GroupConfig`, `Reminder`, `WAAuthState`.
- [ ] Run `npx prisma generate`.
- [ ] Run `npx prisma migrate dev --name init`.
- [ ] Implement `createPrismaClient()` with pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.
- [ ] Test WAL active using temp SQLite file.

## Task 5: Repos

- [ ] Implement `userRepo.upsertByExternal(prisma, platform, externalId)`.
- [ ] Implement `groupRepo.getOrCreate(prisma, platform, externalId)`.
- [ ] Implement `reminderRepo.claimDue(prisma, limit, now)` using `prisma.$transaction` + compare-and-swap `status='pending'`.
- [ ] Implement `markDone`, `markFailed`, `incrementAttempt`.
- [ ] Test two parallel `claimDue()` calls do not double-fire one reminder.

## Task 6: Verify

- [ ] Run `npm run test -- --filter=@bot/utils --filter=@bot/db`.
- [ ] Run `npm run build -- --filter=@bot/utils --filter=@bot/db`.
- [ ] Run `git diff --stat`; do not commit unless user asks.
