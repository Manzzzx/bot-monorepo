# Technical Specification — Bot Monorepo (WhatsApp + Telegram)

- **Status**: Draft v1
- **Date**: 2026-05-22
- **Source of truth**: `docs/superpowers/specs/2026-05-22-bot-monorepo-design.md`

## 1. Stack

| Layer               | Choice                               |
| ------------------- | ------------------------------------ |
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
| Middleware composer | `koa-compose`                        |
| Logger              | `pino`, `pino-pretty`, `pino-roll`   |
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

### Reply Options

```ts
export interface ReplyButton {
  label: string;
  command?: string; // re-dispatched as user input (prefix auto-prepended)
  url?: string; // external link
}

export interface ReplyOpts {
  quote?: boolean;
  mentions?: string[];
  media?: MediaRef | ReplyMedia;
  buttons?: ReplyButton[][]; // ignored on platforms with capabilities.buttons === false
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

`AppConfig` is owned by `@bot/contracts` and the zod schema in `@bot/utils` is checked against it at compile time so drift fails the build.

Feature code must use `AppContext` and `MessageCtx`; no global DB singleton import in features.

## 5. Feature Loader

Static registry in `packages/features/src/_loader.ts`. Each entry maps a category to a feature module; the loader injects guards based on category before registering commands.

Guard injection:

| Category  | Injected guards                    |
| --------- | ---------------------------------- |
| `general` | none                               |
| `owner`   | `requireOwner()`                   |
| `group`   | `requireGroup()`, `requireOwner()` |

Errors:

- Unknown category -> `UnknownCategoryError`.
- Duplicate registration -> `FeatureConflictError`.
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

- `/ping`
- `/help ping`
- `.broadcast --group "hello world"`

Rules:

- Prefixes: `/`, `.`
- Regex: `^[\/.](\S+)\s*(.*)$`
- Args/flags parsed by `yargs-parser`.
- Command aliases resolved by registry.
- Legacy `!` prefix is rejected (returns `null`); plain text falls through to the `message` event.

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

`reminderRepo.claimDue` runs in a single Prisma transaction: scan due rows, atomically flip each from `pending` to `firing` via conditional `updateMany`, and return only rows where the flip won. Then emit `reminder.fire` per claimed row.

Stuck recovery: `reminderRepo.recoverStuck(staleMs)` runs at the start of every scheduler tick. Rows in `firing` whose `updatedAt` is older than `stuckRecoveryMs` (default 5 min) get reset to `pending`, so a process crash mid-fire never strands a reminder.

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
- Error/fatal paths flush logs before exit.
- Per-message error boundary does **not** flush (would block the hot path).
- `console.*`, `process.stdout.write`, manual `.log` writes are banned outside logger implementation.

Redaction (`redact.paths`): `*.password`, `*.token`, `*.authorization`, `*.cookie`, plus all known config secrets (`AUTH_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, `OWNER_WA`, `OWNER_TG`).

## 11. Rate Limit

`RateLimitRegistry.outbound(platform, chatId)` returns a Bottleneck limiter.

Defaults:

- WA: `minTime=800`, `maxConcurrent=1`
- Telegram: `minTime=50`

Adapters must send through the limiter.

## 12. Error Model

```ts
class BotError extends Error {
  constructor(
    message: string,
    code = 'BOT_ERROR',
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
  }
}
class UserFacingError extends BotError {}
class GuardRejection extends UserFacingError {}
class CommandConflictError extends BotError {}
class UnknownCategoryError extends BotError {}
class FeatureConflictError extends BotError {}
```

Error boundary:

- `UserFacingError` / `GuardRejection` -> reply with the user message.
- Unknown -> log full stack with `traceId`/`eventId`, reply generic trace code. Flush is left to the global crash handler so per-message errors stay non-blocking.

## 13. Config

Required env fields (zod-validated):

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

| Variable                       | Value                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `INSTALL_BRANCH`               | `deploy`                                                                |
| `AUTO_UPDATE`                  | `true`                                                                  |
| `CLOUDFLARE_TUNNEL`            | `false`                                                                 |
| `ENABLE_XVFB`                  | `false`                                                                 |
| `NPM_PACKAGES`                 | empty                                                                   |
| `CUSTOM_ENVIRONMENT_VARIABLES` | `NODE_ENV=production;DATABASE_URL=file:/home/container/data/bot.db;...` |

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

## 15. Crash Handling

`installSignalHandlers` (in `apps/bot/src/shutdown.ts`) wires:

- `SIGTERM` / `SIGINT` -> graceful shutdown, exit code 0.
- `uncaughtException` / `unhandledRejection` -> log fatal, then graceful shutdown with exit code 1 so the panel can distinguish crash from clean stop.

Shutdown sequence: pause adapters -> stop scheduler -> drain in-flight -> stop adapters -> Prisma `$disconnect` -> flush logs -> `process.exit(code)`.

## 16. Telegram Buttons

`MessageCtx.capabilities.buttons` is `true` on Telegram, `false` on WA. The shared `reply()` helper auto-strips `buttons` on platforms that don't support them, so the same feature code works on both.

Tele specifics:

- `ReplyButton[][]` rows render as a grammY `InlineKeyboard`. Each `command` button is encoded as `cmd:<text>` callback data (truncated to 64 bytes).
- `bot.on('callback_query:data')` acks the callback fast, then builds a synthetic `MessageCtx` whose `text` is the original command (prefixed with `/` if needed) and re-dispatches via the router.
- Callback ctx `reply()` calls `editMessageText` so the source message updates in place. Falls back to `sendMessage` for media-only sources or when Telegram rejects the edit.

## 17. Testing

Minimum test areas:

- Parser: prefixes, quoted args, flags, legacy `!` rejection.
- Registry: conflict detection, aliases, category grouping.
- Middleware: owner/group/cooldown/error boundary.
- Feature loader: registry validation, guard injection, conflict errors.
- Feature handlers: `createMockCtx()` + reply assertions.
- DB: SQLite in-memory, reminder claim, WAL setup.
- Scheduler: tick emits per claimed row, stuck recovery resets `firing` rows, scheduleOnce behaves under fake timers.
- Logger: same `eventId` in stdout/file, secret redaction, fatal flush.

Coverage threshold: 60% initial.

## 18. Implementation Order

1. Root workspace scaffold.
2. Contracts package.
3. Utils: config, logger, crypto, time.
4. DB schema + client + repos.
5. Core: parser, middleware, registry, router, event bus.
6. Feature loader + MVP features.
7. Adapters WA/Telegram.
8. Scheduler + reminder integration (with stuck-recovery sweep).
9. Telegram buttons + edit-in-place callback flow.
10. Deploy workflow + Pterodactyl templates.
11. Tests + acceptance verification.

## 19. Acceptance Verification Matrix

| Area            | Must verify                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| Local workspace | `npm install`, `npm run build`, `npm run test`, lint, format.                      |
| Runtime boot    | `npm run dev`, WA QR, Telegram online, `npm start` boots both adapters.            |
| Commands        | `/ping`, `/stats`, `/help`, `/menu`, `/remind`, group commands.                    |
| Access control  | Non-owner rejected for owner commands; group commands reject DM + non-owner.       |
| Reminder safety | Restart catchup; parallel claim no double-fire; stuck `firing` rows recover.       |
| DB              | SQLite file created, migrations applied, WAL active, auth blob is encrypted bytes. |
| Deploy          | GH Actions updates `deploy`, panel pulls branch, `.bash_profile` starts bot.       |
| Logging         | `eventId`/`status` in terminal and file; error/fatal flushed; secrets redacted.    |
| Crash handling  | `uncaughtException` triggers graceful shutdown with exit code 1.                   |
| Tele buttons    | Inline keyboard renders; click edits message in place; legacy `!` plain text.      |
| Platform split  | `dev:wa`, `dev:tele`, capabilities set correctly.                                  |