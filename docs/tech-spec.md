# Technical Specification — Bot Monorepo (WhatsApp + Telegram)

- **Status**: Draft v1
- **Date**: 2026-05-22
- **Source of truth**: `docs/superpowers/specs/2026-05-22-bot-monorepo-design.md`

## 1. Stack

| Layer               | Choice                               |
| ------------------- | ------------------------------------ | ---- | ------ | ---------------------------------- |
| Runtime             | Node.js 20+ LTS                      |
| Language            | TypeScript 5 strict, ESM             |
| Package manager     | npm workspaces                       |
| Build orchestrator  | Turborepo                            |
| WA adapter          | `@whiskeysockets/baileys`            |
| Telegram adapter    | `grammY` + `@grammyjs/conversations` |
| DB                  | SQLite + Prisma + WAL                |
| Scheduler           | `croner`                             |
| Rate limit          | `bottleneck`                         |
| Parser              | `yargs-parser`                       |
| Middleware composer | `koa-compose`                        | `r`n | Logger | `pino`, `pino-pretty`, `pino-roll` |
| Validation          | `zod`                                |
| Tests               | `vitest`, `@vitest/coverage-v8`      |

## 2. Workspace Packages

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

Required scripts:

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format:check": "prettier --check .",
    "start": "npx prisma migrate deploy && node apps/bot/dist/index.js",
    "start:wa": "npx prisma migrate deploy && node apps/wa/dist/index.js",
    "start:tele": "npx prisma migrate deploy && node apps/tele/dist/index.js",
    "dev": "turbo run dev --filter=@app/bot",
    "dev:wa": "turbo run dev --filter=@app/wa",
    "dev:tele": "turbo run dev --filter=@app/tele"
  }
}
```

## 3. Contracts

Contracts package is type-only. It defines shared boundaries.

### Platform and Message Context

```ts
export type Platform = 'wa' | 'tele';

export interface PlatformCapabilities {
  buttons: boolean;
  list: boolean;
  edit: boolean;
  reactions: boolean;
}

export interface MessageCtx<TRaw = unknown> {
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string;
  isGroup: boolean;
  timestamp: number;
  capabilities: PlatformCapabilities;
  text: string;
  command: string | null;
  args: string[];
  flags: Record<string, string | boolean | number>;
  replyToId?: string;
  media?: MediaRef;
  reply(text: string, opts?: ReplyOpts): Promise<void>;
  edit?(text: string): Promise<void>;
  delete?(): Promise<void>;
  react?(emoji: string): Promise<void>;
  logger: import('pino').Logger;
  traceId: string;
  raw: TRaw;
}
```

### Feature Contract

```ts
export interface Feature {
  name: string;
  version: string;
  commands?: Command[];
  events?: EventSubscription[];
  middleware?: Middleware[];
  onLoad?(app: AppContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  category?: FeatureCategory;
  guards?: Middleware[];
  handler(ctx: MessageCtx): Promise<void>;
}
```

Cooldown is middleware, not a command field:

```ts
{
  guards: [cooldown({ ms: 5000, scope: 'user' })];
}
```

## 4. AppContext

```ts
export interface AppContext {
  config: AppConfig;
  logger: import('pino').Logger;
  db: import('@prisma/client').PrismaClient;
  bus: EventBus;
  scheduler: Scheduler;
  rateLimit: RateLimitRegistry;
  registry: CommandRegistry;
  adapters: AdapterRegistry;
}
```

Feature code must use `AppContext` and `MessageCtx`; no global DB singleton import in features.

## 5. Feature Loader

Scan rules:

- Flat: `features/src/{general,owner,group}/!(_)*.ts`
- Folder: `features/src/{general,owner,group}/!(_)*/index.ts`
- Skip: `_*.ts`, `*.test.ts`, `*.spec.ts`

Guard injection:

| Category  | Injected guards                    |
| --------- | ---------------------------------- |
| `general` | none                               |
| `owner`   | `requireOwner()`                   |
| `group`   | `requireGroup()`, `requireOwner()` |

Errors:

- Unknown category -> `UnknownCategoryError`.
- Flat/folder duplicate -> `FeatureConflictError`.
- Command alias/name conflict -> `CommandConflictError`.

## 6. Router Pipeline

```text
adapter.onMessage(rawEvt)
  -> buildMessageCtx(rawEvt)
  -> router.dispatch(ctx)
      -> withTraceId()
      -> parseCommand()
      -> mutedGroup check
      -> resolveCommand(ctx)
      -> command auto-guards
      -> command explicit guards
      -> command handler
      -> errorBoundary()
```

Middleware type:

```ts
type Middleware = (ctx: MessageCtx, next: () => Promise<void>) => Promise<void>;
```

## 7. Parser

Input examples:

- `!ping`
- `/help ping`
- `.broadcast --group "hello world"`

Rules:

- Prefixes: `!`, `/`, `.`
- Regex: `^[!\/.](\S+)\s*(.*)$`
- Args/flags parsed by `yargs-parser`.
- Command aliases resolved by registry.

## 8. Database

Datasource:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Runtime URL:

```text
file:/home/container/data/bot.db
```

Local dev URL:

```text
file:./prisma/dev.db
```

Tables:

- `User`
- `Group`
- `GroupConfig`
- `Reminder`
- `WAAuthState`

SQLite init:

```ts
await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
```

## 9. Reminder Claim Algorithm

Pseudo-flow:

```ts
const now = new Date();
const dueIds = await db.reminder.findMany({
  where: { status: 'pending', dueAt: { lte: now } },
  orderBy: { dueAt: 'asc' },
  take: 50,
  select: { id: true },
});

await prisma.$transaction(async (tx) => {
  await tx.reminder.updateMany({
    where: { id: { in: dueIds.map((x) => x.id) }, status: 'pending' },
    data: { status: 'firing' },
  });
  return tx.reminder.findMany({ where: { id: { in: dueIds.map((x) => x.id) }, status: 'firing' } });
});
```

Then emit `reminder.fire` per claimed row.

## 10. Logger

Targets:

- stdout: `pino-pretty`, production single-line for Pterodactyl Console.
- file: `pino-roll`, JSON Lines, daily rotation, 14-day retention.

Mandatory fields:

```json
{
  "eventId": "01JXLOG...",
  "traceId": "01JX...",
  "status": "ok",
  "platform": "wa",
  "feature": "general/ping",
  "command": "ping"
}
```

Consistency requirement:

- Single pino call fans out to terminal and file.
- Same `eventId` must appear in both.
- Error/fatal paths call `flushLogs()` before exit or before generic error reply completes.
- `console.*`, `process.stdout.write`, manual `.log` writes are banned outside logger implementation.

## 11. Rate Limit

`RateLimitRegistry.outbound(platform, chatId)` returns Bottleneck limiter.

Defaults:

- WA: `minTime=800`, `maxConcurrent=1`
- Telegram: `minTime=50`

Adapters must send through limiter.

## 12. Error Model

```ts
class BotError extends Error {
  constructor(
    public code: string,
    message: string,
    public meta?: object,
  ) {
    super(message);
  }
}
class UserFacingError extends BotError {}
class GuardRejection extends BotError {}
class CommandConflictError extends BotError {}
```

Error boundary:

- `UserFacingError` -> show message.
- `GuardRejection` -> show guard message.
- Unknown -> log full stack with traceId/eventId, flush, reply generic code.

## 13. Config

Required env fields:

```ts
NODE_ENV;
LOG_LEVEL;
LOG_DIR;
LOG_NO_COLOR;
DATABASE_URL;
AUTH_ENCRYPTION_KEY;
WA_ENABLED;
OWNER_WA;
WA_RATE_MIN_TIME_MS;
TELE_ENABLED;
TELEGRAM_BOT_TOKEN;
OWNER_TG;
TELE_RATE_MIN_TIME_MS;
```

Cross-validation:

- `TELE_ENABLED && !TELEGRAM_BOT_TOKEN` -> throw.
- `WA_ENABLED && !OWNER_WA` -> warn.
- `TELE_ENABLED && !OWNER_TG` -> warn.

## 14. Deploy Spec

Pterodactyl variables:

| Variable            | Value    |
| ------------------- | -------- | ---- | ------------------------------ | ----------------------------------------------------------------------- |
| `INSTALL_BRANCH`    | `deploy` |
| `AUTO_UPDATE`       | `true`   |
| `CLOUDFLARE_TUNNEL` | `false`  |
| `ENABLE_XVFB`       | `false`  |
| `NPM_PACKAGES`      | empty    | `r`n | `CUSTOM_ENVIRONMENT_VARIABLES` | `NODE_ENV=production;DATABASE_URL=file:/home/container/data/bot.db;...` |

`.bash_profile`:

```bash
cd /home/container
exec npm start
```

## 14.1 Backup Spec

Runtime DB lives at `/home/container/data/bot.db` plus WAL files. Hot backup must use SQLite Online Backup API, not a blind file copy while bot is writing:

```bash
mkdir -p /home/container/backups
sqlite3 /home/container/data/bot.db ".backup '/home/container/backups/bot-$(date +%s).db'"
```

Panel snapshot is acceptable for full-container backup; SQLite `.backup` is preferred for DB-only restore.
CI flow:

1. Push `main`.
2. GitHub Actions builds.
3. Artifact branch `deploy` updated.
4. Pterodactyl restart pulls `deploy`.
5. `.bash_profile` runs `npm start`.

## 15. Testing

Minimum test areas:

- Parser: prefixes, quoted args, flags.
- Registry: conflict detection, aliases, category grouping.
- Middleware: owner/group/cooldown/error boundary.
- Feature loader: flat/folder scan, guard injection, skip private/test files.
- Feature handlers: `createMockCtx()` + reply assertions.
- DB: SQLite in-memory, reminder claim, WAL setup.
- Logger: same `eventId` in stdout/file, PII redaction, fatal flush.

Coverage threshold: 60% initial.

## 16. Implementation Order

1. Root workspace scaffold.
2. Contracts package.
3. Utils: config, logger, crypto, time.
4. DB schema + client + repos.
5. Core: parser, middleware, registry, router, event bus.
6. Feature loader + MVP features.
7. Adapters WA/Telegram.
8. Scheduler + reminder integration.
9. Deploy workflow + Pterodactyl templates.
10. Tests + acceptance verification.

## 17. Acceptance Verification Matrix

| Area            | Must verify                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| Local workspace | `npm install`, `npm run build`, `npm run test`, lint, format.                      |
| Runtime boot    | `npm run dev`, WA QR, Telegram online, `npm start` boots both adapters.            |
| Commands        | `ping`, `stats`, `help`, `menu`, `remind`, group commands.                         |
| Access control  | Non-owner rejected for owner commands; group commands reject DM + non-owner.       |
| Reminder safety | Restart catchup and parallel claim no double-fire via `prisma.$transaction`.       |
| DB              | SQLite file created, migrations applied, WAL active, auth blob is encrypted bytes. |
| Deploy          | GH Actions updates `deploy`, panel pulls branch, `.bash_profile` starts bot.       |
| Logging         | `eventId`/`status` in terminal and file; error/fatal flushed; PII redacted.        |
| Feature loader  | Flat/folder scan, skip `_*.ts`/tests, conflict and unknown category errors.        |
| Platform split  | `dev:wa`, `dev:tele`, capabilities set correctly.                                  |
