# bot-monorepo

A multi-platform chat bot for **WhatsApp** and **Telegram**, sharing a single command core. Modular by category, persistent on SQLite, and shipped to Pterodactyl from a CI-built `deploy` branch.

> [!NOTE]
> One codebase, two platforms. Write a feature once, route it through `MessageCtx`, and it works on both adapters with the same guards, logging, and rate limits.

## Highlights

- **Multi-platform core** via `MessageCtx` abstraction over Baileys and grammY.
- **Modular features** by category: `general/`, `owner/`, `group/` with auto-injected guards.
- **Persistent reminders** with transactional cron claim, no double-fire on restart.
- **Structured logging** through `pino` dual transport, same `eventId` in stdout and rotated JSON file.
- **Encrypted WhatsApp auth blob** at rest using `AUTH_ENCRYPTION_KEY`.
- **Pterodactyl-ready** deploy via GitHub Actions, `.bash_profile`, and `npm start`.

## Stack

| Layer      | Choice                                                       |
| ---------- | ------------------------------------------------------------ |
| Runtime    | Node.js 20+, TypeScript 5 strict, ESM                        |
| Monorepo   | npm workspaces + Turborepo                                   |
| WhatsApp   | `@whiskeysockets/baileys`                                    |
| Telegram   | `grammy` + `@grammyjs/conversations`                         |
| Database   | Prisma 7 + SQLite (WAL) via `@prisma/adapter-better-sqlite3` |
| Scheduler  | `croner`                                                     |
| Rate limit | `bottleneck`                                                 |
| Middleware | `koa-compose`                                                |
| Logger     | `pino` + `pino-pretty` + `pino-roll`                         |
| Tests      | `vitest`                                                     |

## Project structure

```text
apps/
  bot/            # combined entry (WA + Telegram in one process)
  wa/             # WhatsApp-only entry
  tele/           # Telegram-only entry
packages/
  contracts/      # shared types (MessageCtx, Feature, AppContext)
  core/           # router, parser, middleware, scheduler, event bus
  features/       # general/, owner/, group/ feature modules
  adapters/       # WA + Telegram adapter glue
  db/             # Prisma client + repos
  utils/          # config, logger, crypto, time
prisma/           # schema + migrations
docs/             # prd, architect, tech-spec, deploy runbook
.github/          # CI: build + push to deploy branch
```

## Quickstart

> [!IMPORTANT]
> Requires **Node.js 20+** and **npm 10+**. Generate `AUTH_ENCRYPTION_KEY` with `openssl rand -hex 32` before first run.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill DATABASE_URL, AUTH_ENCRYPTION_KEY, TELEGRAM_BOT_TOKEN, OWNER_WA, OWNER_TG

# 3. Database
npx prisma migrate dev

# 4. Build + test
npm run build
npm test

# 5. Run
npm run dev          # combined bot
npm run dev:wa       # WhatsApp only
npm run dev:tele     # Telegram only
```

On first WhatsApp boot, scan the QR printed in the terminal. Auth state is persisted (encrypted) so subsequent restarts skip the QR.

## Scripts

| Script                                     | Description                                       |
| ------------------------------------------ | ------------------------------------------------- |
| `npm run build`                            | Turbo build across all workspaces                 |
| `npm test`                                 | Run vitest in every package                       |
| `npm run lint`                             | ESLint with `--max-warnings=0`                    |
| `npm run format` / `format:check`          | Prettier write / verify                           |
| `npm run dev` / `dev:wa` / `dev:tele`      | Watch mode entries                                |
| `npm start` / `start:wa` / `start:tele`    | Production: `prisma migrate deploy` then run dist |
| `npm run prisma:migrate` / `prisma:deploy` | Schema migrations                                 |

## Writing a feature

Drop a file into a category folder. Category controls auto-guards.

```ts
// packages/features/src/general/ping.ts
import type { Feature } from '@bot/contracts';

const ping: Feature = {
  name: 'general/ping',
  version: '1.0.0',
  commands: [
    {
      name: 'ping',
      description: 'Reply with pong',
      async handler(ctx) {
        await ctx.reply(`pong ${Date.now() - ctx.timestamp}ms`);
      },
    },
  ],
};

export default ping;
```

| Category   | Auto-injected guards                |
| ---------- | ----------------------------------- |
| `general/` | none                                |
| `owner/`   | `requireOwner()`                    |
| `group/`   | `requireGroup()` + `requireOwner()` |

Register the feature in `packages/features/src/_loader.ts` (static registry, deploy ships `dist/` only).

## Configuration

All config goes through `zod`-validated env. Key fields:

| Variable                                           | Required       | Notes                                       |
| -------------------------------------------------- | -------------- | ------------------------------------------- |
| `DATABASE_URL`                                     | yes            | e.g. `file:/home/container/data/bot.db`     |
| `AUTH_ENCRYPTION_KEY`                              | yes            | 64-hex chars, encrypts WA auth blob at rest |
| `WA_ENABLED` / `OWNER_WA`                          | yes if WA on   | JID of owner                                |
| `TELE_ENABLED` / `TELEGRAM_BOT_TOKEN` / `OWNER_TG` | yes if Tele on | from BotFather                              |
| `LOG_LEVEL`, `LOG_DIR`, `LOG_NO_COLOR`             | optional       | defaults to `info`, `./data/log`            |

Full list in [`.env.example`](.env.example) and [`docs/tech-spec.md`](docs/tech-spec.md).

## Deployment

Deploy targets a single Pterodactyl process pulling the CI-built `deploy` branch.

```mermaid
flowchart LR
  Push[git push main] --> CI[GitHub Actions]
  CI --> Build[npm ci + prisma generate + build]
  Build --> Branch[force-push deploy branch]
  Panel[Pterodactyl restart] --> Pull[egg git pull deploy]
  Pull --> Profile[.bash_profile]
  Profile --> Start[npm start]
  Start --> Bot[apps/bot/dist/index.js]
```

> [!TIP]
> Set `AUTO_UPDATE=true` on the egg so each restart pulls the latest `deploy` tip. The bot runs `prisma migrate deploy` before booting, so schema changes are applied automatically.

Full runbook with egg variables, persistent data layout, hot backup, and verification: [`docs/deploy-pterodactyl.md`](docs/deploy-pterodactyl.md).

## Operational checks

After first boot:

```bash
# WAL active
sqlite3 /home/container/data/bot.db "PRAGMA journal_mode;"

# Log fan-out: same eventId in terminal AND file
grep '<eventId>' /home/container/data/log/bot-*.log

# Auth blob encrypted (hex bytes, not JSON)
sqlite3 /home/container/data/bot.db "SELECT hex(encryptedBlob) FROM WAAuthState LIMIT 1;"

# SQLite hot backup (WAL-safe, no downtime)
mkdir -p /home/container/backups
sqlite3 /home/container/data/bot.db ".backup '/home/container/backups/bot-$(date +%s).db'"
```

> [!WARNING]
> Never `cp` the SQLite file while the bot is running. Use the `.backup` command above; it copies through the WAL safely.

## Documentation

- [`docs/prd.md`](docs/prd.md) — product requirements
- [`docs/architect.md`](docs/architect.md) — architecture overview + diagrams
- [`docs/tech-spec.md`](docs/tech-spec.md) — technical spec, contracts, error model
- [`docs/deploy-pterodactyl.md`](docs/deploy-pterodactyl.md) — deploy + ops runbook
- [`docs/superpowers/specs/2026-05-22-bot-monorepo-design.md`](docs/superpowers/specs/2026-05-22-bot-monorepo-design.md) — original design (D1–D26 decisions)
