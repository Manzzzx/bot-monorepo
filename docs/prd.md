# PRD — Bot Monorepo (WhatsApp + Telegram)

- **Status**: Draft v1
- **Date**: 2026-05-22
- **Owner**: @manzz
- **Source of truth**: `docs/superpowers/specs/2026-05-22-bot-monorepo-design.md`

## 1. Ringkasan

Bangun fondasi bot multi-platform untuk WhatsApp dan Telegram dalam satu monorepo. MVP fokus ke skeleton profesional: command routing, feature modular, SQLite persistence, scheduler reminder, group admin tools, structured logging, tests, dan deploy ke Pterodactyl panel.

Produk ini bukan sekadar bot random yang ditambal pake if-else sampai jadi bubur. Targetnya fondasi yang bisa tumbuh tanpa core jadi tong sampah.

## 2. Problem

Saat bot WA/Telegram dibangun langsung di atas library native, masalah cepat muncul:

- Command logic keikat ke Baileys/grammY langsung.
- Feature baru sering nyentuh core.
- Testing susah karena perlu mock native event yang ribet.
- Logging cuma console, restart panel = history ilang.
- Reminder/scheduler rawan ilang setelah restart.
- Deploy panel sering chaos karena env, DB, build, dan start command ga distandarkan.

## 3. Goals

- **Multi-platform**: command yang sama jalan di WA dan Telegram via `MessageCtx` abstraction.
- **Modular**: feature baru cukup tambah file/folder di `packages/features/src/<category>/`.
- **Safe-by-default**: owner/group guard konsisten lewat middleware dan auto-guard by category.
- **Persistent**: SQLite + Prisma + WAL untuk auth state, group config, reminder.
- **Operational**: stdout pretty untuk Pterodactyl, file JSON rotated untuk audit/post-mortem.
- **Deployable**: Pterodactyl-ready via GitHub Actions branch `deploy` + `.bash_profile` auto start.
- **Testable**: unit tests via `createMockCtx()`, core tests, DB tests with in-memory SQLite.

## 4. Non-Goals MVP

- AI provider, sticker, downloader, OCR.
- Redis, multi-instance, multi-proc true split.
- Prometheus metrics, health endpoint.
- Cloudflare Tunnel / inbound webhook.
- KMS-managed secrets.
- WhatsApp Business Cloud API.
- Full i18n.

## 5. Target Users

| User                        | Need                                                |
| --------------------------- | --------------------------------------------------- |
| Bot owner                   | Manage bot, broadcast, shutdown/debug safely        |
| Regular user                | Use public commands like ping, help, menu, reminder |
| Group admin/owner           | Moderate group: kick, mute, antilink, welcome       |
| Developer/future maintainer | Add feature without touching adapter/core spaghetti |

## 6. MVP Feature Scope

### General

- `!ping` — latency check.
- `!stats` — uptime, memory, node version, feature count, command count, DB status.
- `!help` / `!help <cmd>` — grouped command docs, hide owner-only command for non-owner.
- `!menu` — human-readable menu; text-only MVP.
- `!remind`, `!reminders`, `!cancelreminder` — persistent reminders with restart catchup.

### Owner

- `!eval` — guarded debug command, risky, owner-only.
- `!broadcast` — outbound message to known users/groups, rate-limited.
- `!shutdown` — graceful stop.

### Group

- `!kick` — remove user if bot has admin privileges.
- `!mute` — ignore group commands while muted.
- `!antilink` — auto-delete URL messages when enabled.
- `!welcome` — configurable join message.

## 7. Functional Requirements

- Bot must boot WA and Telegram from `apps/bot` orchestrator in one process.
- WA-only and Telegram-only entries must exist for dev/future split: `apps/wa`, `apps/tele`.
- Parser must support prefixes `!`, `/`, `.` plus quoted args and flags.
- Feature loader must scan flat files and folder entries:
  - `features/src/<cat>/<name>.ts`
  - `features/src/<cat>/<name>/index.ts`
- Feature categories must inject guards:
  - `general`: no guard
  - `owner`: `requireOwner()`
  - `group`: `requireGroup()` + `requireOwner()` for MVP
- Reminder delivery must survive restart and avoid double-fire via DB compare-and-swap.
- Logger must write the same event to terminal and file with matching `eventId`.

## 8. Non-Functional Requirements

| Category        | Requirement                                                              |
| --------------- | ------------------------------------------------------------------------ |
| Reliability     | Graceful shutdown under Pterodactyl Stop; flush logs before exit         |
| Persistence     | SQLite WAL mode, Prisma migrations, auth state encrypted blob            |
| Security        | Owner guard, no secret logging, AES-256-GCM auth state envelope          |
| Performance     | Outbound rate limit per platform/chat; no blocking hot loops             |
| Maintainability | Contracts package, clean adapter/core/features boundary                  |
| Observability   | `traceId`, `eventId`, `status`, `platform`, `feature`, `command` in logs |
| Testability     | Unit tests for parser/registry/middleware/features; in-memory DB tests   |

## 9. Deployment Requirements

- Deploy target: Pterodactyl panel, Debian 12 universal egg.
- Runtime DB: `/home/container/data/bot.db`.
- Log dir: `/home/container/data/log`.
- Start command via `.bash_profile`: `npm start`.
- `npm start`: `npx prisma migrate deploy && node apps/bot/dist/index.js`.
- CI builds from `main` and force-pushes artifact to `deploy` branch.`r`n- Runtime env is injected via Pterodactyl `CUSTOM_ENVIRONMENT_VARIABLES` (`KEY=VAL;KEY=VAL`).
- Panel pulls `deploy` branch via `AUTO_UPDATE=true`.

## 10. Success Metrics

- `npm install`, `npm run build`, `npm run test`, lint, format all pass.
- `!ping`, `!help`, `!menu`, `!remind` work on both WA and Telegram.
- Owner-only commands reject non-owner on both platforms.
- Reminder fires after restart catchup.
- `eventId` from terminal can be found in file log.
- Pterodactyl start boots bot within 60 seconds.
- Pterodactyl stop exits gracefully within 10 seconds.

## 11. Risks

| Risk                         | Impact                             | Mitigation                                                        |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| Baileys instability          | WA reconnect loops / process crash | Backoff, loggedOut terminal handling, future worker_threads split |
| SQLite write contention      | `SQLITE_BUSY` under async load     | WAL, `busy_timeout=5000`, single process                          |
| Secret exposure in panel env | Token/key visible to panel admin   | Trust boundary documented, rotate on migration                    |
| WA buttons unreliable        | Bad UX if button-driven            | Text-first UX, Telegram buttons post-MVP only                     |
| Log divergence               | Terminal error absent in file      | Single pino fan-out, `eventId`, critical flush                    |

## 12. Open Questions

Canonical source: OQ1-OQ12 in the design spec. Product-level summary:

| OQ   | Question                        | Product impact                                                            |
| ---- | ------------------------------- | ------------------------------------------------------------------------- |
| OQ1  | Group admin authority           | Move group commands from owner-only to real group admin permissions.      |
| OQ2  | Telegram `/setcommands` sync    | Better Telegram UX via BotFather command list automation.                 |
| OQ3  | Multi-tenant WA sessions        | Support more than one WhatsApp session/account.                           |
| OQ4  | Antilink whitelist              | Avoid deleting approved domains.                                          |
| OQ5  | Fault isolation                 | Split adapters to `worker_threads` if Baileys instability hurts Telegram. |
| OQ6  | Local dev DB reset flow         | Keep SQLite dev setup painless.                                           |
| OQ7  | KMS-managed secrets             | Reduce panel-env secret exposure.                                         |
| OQ8  | Bottleneck idle eviction        | Prevent limiter eviction while tasks are in flight.                       |
| OQ9  | WhatsApp Business Cloud API     | Required if reliable WA buttons become product requirement.               |
| OQ10 | Telegram interactive escalation | Add `tele.ts` per feature once interactive features exceed two.           |
| OQ11 | Category sub-grouping           | Add one more folder depth when one category has >10 features.             |
| OQ12 | `requireGroupAdmin()`           | Replace owner-only group MVP with real group-admin checks post-MVP.       |
