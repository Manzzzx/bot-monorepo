# Bot Monorepo (WhatsApp + Telegram) — Design Spec

- **Status**: Draft v3 (post-Pterodactyl review)
- **Date**: 2026-05-22
- **Owner**: @manzz
- **Scope**: MVP skeleton bot all-in-one modular untuk WhatsApp & Telegram, single orchestrator process, SQLite + Prisma (WAL mode), contract-first plugin architecture (renamed: features), deploy ke Pterodactyl panel via GitHub Actions → branch `deploy`.

## 1. Tujuan

Bangun fondasi bot multi-platform yang:

- **Modular** — fitur baru = tambah folder feature, bukan modify core
- **Type-safe** — TS strict, contracts package terpisah (zero runtime dep)
- **Clean architecture** — transport (adapter) terpisah dari domain (features) lewat AppContext (DI) + MessageCtx (port)
- **Scalable** — single-proc untuk MVP, sengaja didesain bisa di-split jadi multi-proc tanpa rewrite
- **Profesional** — ada test, lint, error boundary, structured logging, fail-fast config, envelope-encrypted Baileys auth (key di env, mitigation tier-1, KMS post-MVP), outbound rate-limit

Non-goal MVP: AI provider, sticker, downloader, OCR, Redis, multi-instance, i18n, prom metrics, health endpoint, KMS-managed secrets, Cloudflare Tunnel (egg support ada, tapi WA outbound + Tele long-poll = ga butuh inbound).

## 2. Stack

| Layer               | Pilihan                                                                          | Alasan                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime             | Node.js 20+ LTS                                                                  | stable, ESM mature, Native fetch                                                                                                                                                                                         |
| Bahasa              | TypeScript 5.x (strict)                                                          | tipe ketat, refactor aman                                                                                                                                                                                                |
| Pkg manager         | npm workspaces                                                                   | zero install, udah bawaan node                                                                                                                                                                                           |
| Orchestrator        | Turborepo (`npx turbo`)                                                          | cache build/test, parallel, no global install                                                                                                                                                                            |
| WA lib              | `@whiskeysockets/baileys`                                                        | multi-device, ringan, fitur lengkap                                                                                                                                                                                      |
| Tele lib            | `grammY` + `@grammyjs/conversations`                                             | TS-first, modern, plugin lengkap                                                                                                                                                                                         |
| DB                  | SQLite + Prisma (WAL mode)                                                       | zero infra extra (file-based, hidup di volume Pterodactyl), single-proc bikin contention non-issue, full Prisma type-safety; backup = container snapshot panel atau cp file; swap-able ke Postgres kalau migrate hosting |
| Scheduler           | `croner`                                                                         | drift-aware cron, zero-dep                                                                                                                                                                                               |
| Rate limit          | `bottleneck`                                                                     | token bucket, mature                                                                                                                                                                                                     |
| LRU cache           | `lru-cache`                                                                      | dipake rate-limit registry + cooldown middleware                                                                                                                                                                         |
| Parser              | `yargs-parser`                                                                   | flag/quoted/escape battle-tested                                                                                                                                                                                         |
| Logger              | `pino` + `pino-pretty` + `pino-roll`                                             | structured, fast, daily rotation 14d retention                                                                                                                                                                           |
| Validation          | `zod`                                                                            | runtime + static type infer                                                                                                                                                                                              |
| Middleware composer | `koa-compose`                                                                    | tested, picked over DIY (decision §6.1)                                                                                                                                                                                  |
| Test                | `vitest` + `@vitest/coverage-v8`                                                 | TS+ESM friendly, fast                                                                                                                                                                                                    |
| Lint/format         | ESLint flat config + Prettier                                                    | standar 2026                                                                                                                                                                                                             |
| Deploy              | Pterodactyl panel (egg "universal" Debian 12) + GitHub Actions → branch `deploy` | constrained by hosting; egg auto-pull + auto npm install, `.bash_profile` → `npm start`; CI build artifact (`dist/` + Prisma client) committed ke branch `deploy`                                                        |

## 3. Struktur Monorepo

```
bot-monorepo/
├── apps/
│   ├── bot/                      # ORCHESTRATOR (default entry — load WA + Tele dlm 1 process)
│   │   ├── src/
│   │   │   ├── index.ts          # entry: build AppContext, registerWA(app), registerTele(app), start
│   │   │   ├── bootstrap.ts      # AppContext builder, feature loader
│   │   │   └── shutdown.ts       # graceful shutdown handler (semua adapter)
│   │   └── package.json
│   ├── wa/                       # WhatsApp-only entry (dev-friendly + future split-ready)
│   │   ├── src/
│   │   │   ├── index.ts          # standalone entry: build AppContext + WA adapter only
│   │   │   └── start.ts          # exported `registerWA(app)` — dipake apps/bot/
│   │   └── package.json
│   └── tele/                     # Telegram-only entry (dev-friendly + future split-ready)
│       ├── src/
│       │   ├── index.ts          # standalone entry: build AppContext + Tele adapter only
│       │   └── start.ts          # exported `registerTele(app)` — dipake apps/bot/
│       └── package.json
├── packages/
│   ├── contracts/                # interfaces only, zero runtime dep
│   │   └── src/
│   │       ├── message-ctx.ts    # MessageCtx<TRaw>, ReplyOpts, MediaRef
│   │       ├── plugin.ts         # Feature, Command, EventSubscription, Middleware
│   │       ├── app-context.ts    # AppContext (DI surface)
│   │       └── testing.ts        # createMockCtx() factory
│   ├── core/                     # router, registry, middleware, parser, errors
│   │   └── src/
│   │       ├── router.ts
│   │       ├── command-registry.ts
│   │       ├── feature-loader.ts
│   │       ├── middleware/       # builtin: requireOwner, requireGroup, cooldown, log
│   │       ├── parser.ts         # yargs-parser wrapper
│   │       ├── event-bus.ts
│   │       └── errors.ts
│   ├── adapters/
│   │   └── src/
│   │       ├── wa/               # baileys adapter, ratelimit, encrypted auth state
│   │       └── tele/             # grammY adapter
│   ├── db/                       # prisma schema, client, migrations, repos
│   │   └── src/
│   │       ├── client.ts
│   │       └── repos/            # user-repo, group-repo, reminder-repo
│   ├── features/                 # was "plugins" — modul internal, organize by access scope
│   │   └── src/
│   │       ├── general/          # public — semua user, no auto-guard
│   │       │   ├── ping.ts       # flat: 1 file = 1 Feature
│   │       │   ├── stats.ts
│   │       │   ├── help.ts
│   │       │   ├── menu.ts
│   │       │   └── remind/       # escalated to folder (multi-cmd + scheduler subscription)
│   │       │       ├── index.ts
│   │       │       ├── _handlers.ts       # private helper (underscore prefix → loader skip)
│   │       │       ├── _subscriptions.ts
│   │       │       └── index.test.ts
│   │       ├── owner/            # auto-guard requireOwner()
│   │       │   ├── eval.ts
│   │       │   ├── broadcast.ts
│   │       │   └── shutdown.ts
│   │       ├── group/            # auto-guard requireGroup() + requireOwner() (MVP)
│   │       │   ├── kick.ts
│   │       │   ├── mute.ts
│   │       │   ├── antilink.ts
│   │       │   └── welcome.ts
│   │       └── _loader.ts        # scan flat .ts + folder/index.ts, inject guards by category
│   └── utils/                    # logger, config, crypto, time
│       └── src/
│           ├── logger.ts
│           ├── config.ts         # zod env schema, fail-fast loader
│           ├── crypto.ts         # AES-256-GCM helpers
│           └── time.ts           # parseDuration("10m"), etc.
├── prisma/                       # schema.prisma + migrations (single source)
├── .github/
│   └── workflows/
│       └── deploy.yml            # build → push artifact ke branch deploy
├── .env.example
├── .eslintrc / eslint.config.js
├── .prettierrc
├── package.json
├── tsconfig.base.json
├── turbo.json
└── README.md
```

**Catatan**:

- `apps/bot/` = orchestrator default (single-proc, deploy target Pterodactyl). `apps/wa/` & `apps/tele/` = entry standalone untuk dev/debug per platform & future true-split (lihat §13 D1). Semua share AppContext + packages.
- Prisma schema di **root** `prisma/` biar 1 source of truth, di-consume `packages/db/`.
- Pterodactyl tetep run `npm start` (= `apps/bot/dist/index.js`). Kalau suatu hari split jadi 2 server: ganti start command per server (`start:wa` / `start:tele`), arsitektur udah kompatibel.

## 4. Contracts (`packages/contracts`)

Zero runtime dep. Hanya interface + type. Di-consume oleh `core`, `adapters`, `features`.

### 4.1 MessageCtx (Port — diisi oleh adapter)

```ts
export type Platform = 'wa' | 'tele';

export interface MediaRef {
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType?: string;
  download(): Promise<Buffer>;
}

export interface ReplyOpts {
  quote?: boolean; // reply to current message
  mentions?: string[]; // userIds to mention
  media?: MediaRef | { buffer: Buffer; mimeType: string; filename?: string };
}

export interface PlatformCapabilities {
  buttons: boolean; // inline callback buttons
  list: boolean; // list/menu picker
  edit: boolean; // edit own message after send
  reactions: boolean; // emoji react
}

export interface MessageCtx<TRaw = unknown> {
  // identity
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string; // sender id (platform-native)
  isGroup: boolean;
  timestamp: number; // epoch ms when message was received (utk latency calc, mis. !ping)
  capabilities: PlatformCapabilities;

  // content
  text: string;
  command: string | null; // resolved by parser middleware
  args: string[]; // positional args
  flags: Record<string, string | boolean | number>;
  replyToId?: string; // if user replied to a message
  media?: MediaRef;

  // actions
  reply(text: string, opts?: ReplyOpts): Promise<void>;
  edit?(text: string): Promise<void>;
  delete?(): Promise<void>;
  react?(emoji: string): Promise<void>;

  // observability
  logger: import('pino').Logger; // child logger w/ {platform, userId, chatId, traceId}
  traceId: string;

  // escape hatch (typed) — gunakan utk akses native API (Tele button, dll). Dilarang di shared feature handler.
  raw: TRaw;
}
```

**Catatan**:

- `isOwner` SENGAJA dihilangkan dari ctx — itu cross-cutting concern, di-resolve di middleware `requireOwner()`.
- `capabilities` di-isi adapter berdasarkan platform. Tele: `{buttons:true, list:true, edit:true, reactions:true}`. WA (Baileys): `{buttons:false, list:false, edit:true, reactions:true}` (defensive default; button Baileys unreliable, lihat §16).
- `raw: TRaw` adalah escape hatch untuk fitur platform-spesifik (mis. inline button Tele). Feature shared **dilarang** akses `ctx.raw` — pakai per-platform handler module (lihat §16).

### 4.2 Feature (renamed from Plugin)

```ts
export interface Feature {
  name: string;
  version: string;
  commands?: Command[];
  events?: EventSubscription[];
  middleware?: Middleware[]; // global middleware contributed by feature
  onLoad?(app: AppContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  category?: FeatureCategory; // override visibility di !help; default ikut folder kategori
  guards?: Middleware[]; // composable: requireOwner(), requireGroup(), cooldown({ms,scope})
  handler(ctx: MessageCtx): Promise<void>;
}

export type EventName =
  | 'message' // any message (post-parse)
  | 'group.join'
  | 'group.leave'
  | 'group.update'
  | 'connection.ready'
  | 'connection.lost'
  | 'reminder.fire'; // emitted by Scheduler

export interface EventSubscription {
  event: EventName;
  handler(payload: unknown, app: AppContext): Promise<void>;
}

export type Middleware = (ctx: MessageCtx, next: () => Promise<void>) => Promise<void>;
```

**Catatan**:

- Cooldown adalah guard, **bukan field di Command**. Pakai: `guards: [cooldown({ ms: 5000, scope: 'user' })]`. Alasan: konsisten dengan pipeline middleware, ga ada special-case di registry, mudah compose dgn guard lain.
- `Command.category` override visibility di `!help` only. Folder path tetap menentukan auto-guard (lihat §7.0). Kalau set `category: 'general'` untuk command di `owner/whoami.ts` → command tetap kena `requireOwner()`, tapi muncul di `!help` semua user.
- `Feature.onUnload` saat ini no-op MVP (no hot-reload). Tetep di-expose biar future hot-reload ga breaking change.
- `Feature.middleware?[]` = global middleware contributed by feature (mis. antilink contribute middleware low-priority cek URL di tiap message). Beda dari `Command.guards` yang per-command.

### 4.3 AppContext (DI surface)

```ts
export interface AppContext {
  config: AppConfig; // validated env (zod)
  logger: import('pino').Logger; // root logger
  db: import('@prisma/client').PrismaClient;
  bus: EventBus; // pub/sub utk EventName
  scheduler: Scheduler; // wraps croner + reminder repo
  rateLimit: RateLimitRegistry; // outbound limiter per chat
  registry: CommandRegistry; // exposed for help feature
  adapters: AdapterRegistry; // resolve adapter by platform: app.adapters.get('wa').sendMessage(chatId, text)
  // features TIDAK boleh akses raw lib client (sock baileys / bot grammY) langsung
}
```

**Aturan**: feature HANYA boleh akses dunia luar via `AppContext`. Dilarang `import { prisma } from '...'` global singleton.

Tipe pendukung:

```ts
export interface AdapterRegistry {
  get(platform: Platform): MessageAdapter; // throws if disabled
  has(platform: Platform): boolean;
}

export interface MessageAdapter {
  platform: Platform;
  // Dipakai feature/scheduler utk kirim pesan tanpa pegang client native:
  sendMessage(chatId: string, text: string, opts?: ReplyOpts): Promise<void>;
}

export interface EventBus {
  emit(event: EventName, payload: unknown): void;
  on(event: EventName, handler: (payload: unknown, app: AppContext) => Promise<void> | void): void;
}
```

### 4.4 Testing helper

```ts
// packages/contracts/src/testing.ts
export function createMockCtx(overrides?: Partial<MessageCtx>): MessageCtx {
  // returns spy-able MessageCtx untuk unit test feature handler
}
```

## 5. Adapter Layer (`packages/adapters`)

Adapter = transformer dari event native → `MessageCtx` → kirim ke `Router`.

### 5.1 Tanggung jawab adapter

- Connection lifecycle (connect, reconnect, ready, lost)
- Decode pesan native → `MessageCtx` (kecuali `command/args/flags` — diisi parser middleware)
- Implement aksi: `reply`, `edit`, `delete`, `react`
- Hooked ke `RateLimitRegistry` untuk outbound throttle (terutama WA)
- Emit event ke `EventBus` (group join/leave, connection state)
- BUKAN tugasnya: parsing command, owner check, cooldown — semua itu middleware

### 5.2 WA adapter (Baileys)

- Auth state: **custom** Prisma-backed + AES-256-GCM (lihat §8.2). Tidak pakai `useMultiFileAuthState`.
- Outbound throttle: `bottleneck` per `chatId` (1 msg / 800ms default, adjustable via env).
- Reconnect: exponential backoff (1s → 2s → 4s, max 30s), max retries diatur env.
- Reaction & quote: native support → expose via `ctx.react()` / `ReplyOpts.quote`.
- Media download: `MediaRef.download()` lazy via `downloadMediaMessage`.

### 5.3 Tele adapter (grammY)

- Long polling (default), webhook opsional via env (untuk deploy serverless di future, bukan MVP).
- Owner cmd jalan untuk semua prefix valid (no platform-specific rule).
- Conversations plugin di-mount global (pakai dari feature lewat `app.bus` event hook).

## 6. Core: Router, Middleware, Parser

### 6.1 Router pipeline

```
adapter.onMessage(rawEvt)
  └─> buildMessageCtx(rawEvt)         # adapter
       └─> router.dispatch(ctx)
            ├─> globalMiddleware[]    # log, parse, rateLimitInbound
            ├─> resolveCommand(ctx)   # via CommandRegistry
            ├─> commandGuards[]       # requireOwner, requireGroup, cooldown
            └─> command.handler(ctx)
                  └─> errorBoundary   # try/catch → log + reply generic
```

Pipeline pakai Koa-style middleware (`(ctx, next) => Promise<void>`). Composer pake `koa-compose` (atau implement manual ~20 baris).

### 6.2 Built-in middleware (di `packages/core/src/middleware/`)

| Middleware        | Tugas                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| `withTraceId()`   | bind `ctx.traceId = ulid()`, `ctx.logger = root.child({traceId, ...})`         |
| `parseCommand()`  | resolve prefix `[!/.]`, populate `command/args/flags` via `yargs-parser`       |
| `requireOwner()`  | reject jika `ctx.userId` ≠ owner config (per platform)                         |
| `requireGroup()`  | reject jika `!ctx.isGroup`                                                     |
| `cooldown(opts)`  | in-memory LRU per scope (`user`/`chat`/`global`), reply "tunggu Ns"            |
| `errorBoundary()` | wrap handler; log error w/ traceId; reply "Terjadi kesalahan, kode: {traceId}" |

Middleware composable di level command via `Command.guards`.

### 6.3 Parser

Wrapper di atas `yargs-parser`:

```ts
export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, string | boolean | number>;
}
export function parseInput(text: string): ParsedCommand | null;
```

- Prefix yang diterima: `!`, `/`, `.`
- Regex prefix: `^[!\/.](\S+)\s*(.*)$`
- Mendukung quoted args (`"hello world"`), flag `--key=value` / `--key value` / `--bool`
- Owner-only command tetap berlaku tanpa pengecualian prefix per platform (dropped per review S1)

### 6.4 CommandRegistry

```ts
export type FeatureCategory = 'general' | 'owner' | 'group';

export interface RegisteredCommand {
  command: Command;
  feature: Feature;
  category: FeatureCategory; // resolved dari folder path
  fullName: string; // "owner/eval", "group/kick" (= feature.name + "/" + cmd.name)
}

class CommandRegistry {
  register(feature: Feature, category: FeatureCategory): void; // index cmd + aliases, detect conflict
  resolve(name: string): RegisteredCommand | null;
  list(): RegisteredCommand[];
  byCategory(): Record<FeatureCategory, RegisteredCommand[]>;
}
```

Konflik nama/alias → throw `CommandConflictError` saat register (fail-fast di boot). Kategori valid hardcoded (`general`/`owner`/`group`); folder lain di `features/src/` → throw `UnknownCategoryError`.

## 7. Features (MVP)

### 7.0 Organisasi by access scope

Feature di-organize **by access scope** (siapa yang boleh pake), bukan domain function. 3 kategori hardcoded:

| Kategori  | Path                              | Auto-guard injected                                                        | Use case                                      |
| --------- | --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| `general` | `features/src/general/<feature>/` | (none)                                                                     | Public — semua user                           |
| `owner`   | `features/src/owner/<feature>/`   | `requireOwner()`                                                           | Owner only — eval, broadcast, shutdown, debug |
| `group`   | `features/src/group/<feature>/`   | `requireGroup()` + `requireOwner()` (MVP) → `requireGroupAdmin()` post-MVP | Admin grup — kick, mute, antilink, welcome    |

**Loader** (`packages/features/src/_loader.ts`):

Scan dua pattern dalam tiap kategori:

| Pattern            | Bentuk                               | Use case                                                                           |
| ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Flat (default)     | `features/src/<cat>/<name>.ts`       | 1 cmd, <300 LOC, no state, no per-platform module                                  |
| Folder (escalated) | `features/src/<cat>/<name>/index.ts` | multi-cmd, event subscription, helper privat, atau butuh `tele.ts`/`wa.ts` (§16.3) |

Glob:

- `features/src/{general,owner,group}/!(_)*.ts` (flat, skip `_loader.ts`, `_*.ts`)
- `features/src/{general,owner,group}/!(_)*/index.ts` (folder)

Aturan loader:

- Tiap match: import `default Feature`, infer kategori dari `path[0]`
- Inject auto-guard ke `Command.guards[]` (prepend; explicit guard di feature tetep jalan setelahnya)
- Folder selain 3 kategori valid → throw `UnknownCategoryError` (fail-fast)
- Konflik (mis. `general/ping.ts` + `general/ping/index.ts` ada dua-duanya) → throw `FeatureConflictError`
- File/folder berawalan `_` → SKIP (private helper, mis. `_handlers.ts`, `_subscriptions.ts`)
- File `*.test.ts` / `*.spec.ts` → SKIP
- Boot log: `loaded feature owner/eval (auto-guard: requireOwner) [flat]` — audit trail eksplisit + bentuk
- `Feature.name` di-rewrite jadi `${category}/${baseName}` (mis. `general/ping`, `owner/eval`, `general/remind`)

**Kapan escalate flat → folder**:

- Multi-cmd dalam 1 Feature (mis. `remind` punya 3 cmd)
- Punya `EventSubscription` non-trivial (mis. `'reminder.fire'`, `'group.join'`)
- File >300 LOC → split ke `_handlers.ts`, `_lib.ts`, dll
- Butuh per-platform module post-MVP (`tele.ts`, `wa.ts` per Pendekatan C §16.3)
- Punya unit test (test file co-located lebih rapih dalam folder)

**Aturan umum**:

- 1 file/folder = 1 Feature = bisa multiple Command
- Pindah feature antar kategori = **perubahan behavior** (auto-guard berubah). Treat path sebagai semantic kontrak.
- Feature mau opt-out auto-guard? Tetep harus pilih kategori yang sesuai. Edge case (owner-cmd yang harus visible buat semua di `!help`) → set `Command.category` override, jangan ngakalin folder.
- `Command.category` di Command interface override visibility di `!help` (default: ikut folder).

### 7.1 `general/ping`

- `!ping` → balas `pong (latency: {ms}ms)` (latency = now − message timestamp)
- Guards: (auto: none)

### 7.2 `general/stats`

- `!stats` → uptime, RSS memory, node version, feature count, command count, db connection status
- Guards: (auto: none)

### 7.3 `general/help`

- `!help` → list command grouped by kategori dari `app.registry.byCategory()`
- `!help <cmd>` → detail: description, usage, aliases, category, guards (label only)
- Hide command kategori `owner` (atau yang punya `requireOwner` guard) untuk non-owner — termasuk semua aliases-nya
- Untuk `group` kategori, tampil hanya kalau caller di group context

### 7.4 `general/menu`

- `!menu` → menu visual cantik: branding, list kategori + count command, instruksi `!help <cmd>`
- Tele: bisa di-enrich dengan inline button per kategori (post-MVP, di `tele.ts` per Pendekatan C §16.3). MVP: text only.
- WA: text formatted dengan emoji + section divider

### 7.5 `general/remind` (scheduler)

Commands:

- `!remind <durasi> <text>` → contoh `!remind 10m beli kopi`. Format: `Ns`/`Nm`/`Nh`/`Nd`, combine `1h30m`
- `!reminders` → list reminder aktif user (`status='pending'`)
- `!cancelreminder <id>` → cancel by id (only owner reminder)

Mekanika:

- Insert ke `Reminder` table: `status='pending'`, `dueAt`, `attemptCount=0`
- `Scheduler` (croner) tick tiap 30 detik:
  1. `SELECT id FROM Reminder WHERE status='pending' AND dueAt <= $now ORDER BY dueAt LIMIT 50` (Prisma param: `now = new Date()`)
  2. **Atomic claim** via `prisma.$transaction`: `UPDATE Reminder SET status='firing' WHERE id IN (...) AND status='pending'` (compare-and-swap)
  3. Tiap row: emit `'reminder.fire'` → handler kirim reply via adapter platform
  4. On success → `status='done'`; on error → `attemptCount++`, `lastError`, retry max 3 (next tick); exceed → `status='failed'`
- **Boot catchup**: panggil `tickHandler()` 1x setelah adapter ready → fire reminder yang miss saat bot mati
- **Idempotency**: CAS UPDATE aman dari double-fire dalam single proc; multi-proc bukan concern MVP (D19)

### 7.6 `owner/eval` (debug, hati-hati)

- `!eval <code>` → run JS expression dalam sandbox `vm.runInNewContext({ ctx, app })`, reply hasilnya
- Output truncate 4000 chars (Tele/WA limit)
- **Catatan keamanan**: walaupun `requireOwner()`, jangan disable. Kalau owner credential bocor = full RCE. Skip kalau ga butuh.
- Guards: (auto: `requireOwner()`)

### 7.7 `owner/broadcast`

- `!broadcast <text>` → kirim pesan ke semua user yang pernah interact (per-platform)
- `!broadcast --group` → ke semua group bot ikut
- Rate-limit per outbound (gunakan `bottleneck`); progress reply tiap 50 destinasi
- Guards: (auto: `requireOwner()`)

### 7.8 `owner/shutdown`

- `!shutdown` → graceful stop bot (panggil `shutdown.ts` flow)
- Pterodactyl auto-restart? Egg default ga restart kecuali config'd. Jadi ini bener-bener stop. Berguna kalau bot misbehave dan butuh manual gate.
- Guards: (auto: `requireOwner()`)

### 7.9 `group/kick`

- `!kick @user` (atau reply ke pesan target)
- WA: butuh bot admin grup. Kalo bukan admin → reply "bot bukan admin, gak bisa kick". Cek via `sock.groupMetadata`
- Tele: butuh privilege `can_restrict_members`
- Guards: (auto: `requireGroup()` + `requireOwner()` MVP)

### 7.10 `group/mute`

- `!mute on|off` → toggle bot diam di grup ini (state di `GroupConfig.muted`)
- Saat muted: bot abaikan semua command di grup tsb (early return di middleware)
- Guards: (auto: `requireGroup()` + `requireOwner()`)

### 7.11 `group/antilink`

- `!antilink on|off` → auto-delete pesan berisi URL non-whitelist
- Implementasi via `event: 'message'` low-priority middleware
- Whitelist domain: post-MVP (OQ4)
- Guards: (auto: `requireGroup()` + `requireOwner()`)

### 7.12 `group/welcome`

- `!welcome <text>` (set; placeholder `{user}` / `{group}`)
- `!welcome off` → disable
- Subscribe `event: 'group.join'` → kirim message kalau set
- Guards: (auto: `requireGroup()` + `requireOwner()`)

### 7.13 Layout: flat vs folder

**Flat (default, paling banyak feature):**

```ts
// features/src/general/ping.ts
import type { Feature } from '@bot/contracts';

const feature: Feature = {
  name: 'ping', // di-rewrite jadi 'general/ping' oleh loader
  version: '1.0.0',
  commands: [
    {
      name: 'ping',
      description: 'Latency check',
      handler: async (ctx) => {
        const latency = Date.now() - ctx.timestamp;
        await ctx.reply(`pong (${latency}ms)`);
      },
    },
  ],
};

export default feature;
```

**Folder (escalated):**

```
features/src/general/remind/
├── index.ts                # export default Feature { commands, events, onLoad }
├── _handlers.ts            # handler functions (private — underscore = loader skip)
├── _subscriptions.ts       # 'reminder.fire' event handler (private)
└── index.test.ts           # vitest unit tests (loader auto-skip *.test.ts)
```

```ts
// features/src/general/remind/index.ts
import type { Feature } from '@bot/contracts';
import { handleRemind, handleReminders, handleCancel } from './_handlers';
import { onReminderFire } from './_subscriptions';

const feature: Feature = {
  name: 'remind',                  // di-rewrite jadi 'general/remind'
  version: '1.0.0',
  commands: [
    { name: 'remind', handler: handleRemind, ... },
    { name: 'reminders', handler: handleReminders, ... },
    { name: 'cancelreminder', aliases: ['cancel'], handler: handleCancel, ... },
  ],
  events: [{ event: 'reminder.fire', handler: onReminderFire }],
};

export default feature;
```

**Kriteria escalate flat → folder** (dari §7.0):

- Multi-cmd dalam 1 Feature (`remind`)
- Event subscription non-trivial (`'reminder.fire'`, `'group.join'`)
- File >300 LOC
- Butuh per-platform module post-MVP (`tele.ts`, `wa.ts`)

**Konvensi**:

- Helper privat di folder: prefix `_` (mis. `_handlers.ts`, `_lib.ts`) → loader auto-skip
- Test file: `*.test.ts` co-located dengan implementasi → loader auto-skip
- Public re-export di `index.ts` aja (entry point)

**Catatan Tele**: bot butuh privilege admin + `setPrivacy = false` di BotFather utk baca pesan grup.

## 8. Database & Persistence

### 8.1 Prisma schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id          String   @id @default(cuid())
  platform    String   // 'wa' | 'tele'
  externalId  String   // WA jid / Tele user id
  isOwner     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  reminders   Reminder[]

  @@unique([platform, externalId])
  @@index([platform])
}

model Group {
  id          String   @id @default(cuid())
  platform    String
  externalId  String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  config      GroupConfig?

  @@unique([platform, externalId])
}

model GroupConfig {
  groupId       String   @id
  group         Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  antiLink      Boolean  @default(false)
  welcomeMsg    String?
  muted         Boolean  @default(false)
  mutedUntil    DateTime?
  updatedAt     DateTime @updatedAt
}

enum ReminderStatus {
  pending
  firing
  done
  failed
}

model Reminder {
  id            String          @id @default(cuid())
  userId        String
  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatId        String          // where to deliver
  platform      String
  text          String
  dueAt         DateTime
  status        ReminderStatus  @default(pending)
  attemptCount  Int             @default(0)
  lastError     String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@index([dueAt, status])
  @@index([userId, status])
}

// Encrypted Baileys auth state — single row per session
model WAAuthState {
  id              String   @id @default("default")    // single tenant MVP
  encryptedBlob   Bytes                              // AES-256-GCM(JSON.stringify(state))
  iv              Bytes                              // 12 bytes
  authTag         Bytes                              // 16 bytes
  updatedAt       DateTime @updatedAt
}
```

**Catatan SQLite**: enum di Prisma SQLite di-emulate sebagai `TEXT` + check (transparent). `Bytes` field di-store sebagai BLOB native. WAL mode wajib di-enable saat boot (lihat §8.4) untuk reader-writer concurrency dgn async Prisma calls.

### 8.2 Baileys auth state — encrypted Prisma adapter

- File: `packages/adapters/src/wa/auth-state.ts`
- Implement interface `AuthenticationState` Baileys dengan persistence ke `WAAuthState`
- Enkripsi: `AES-256-GCM` (lihat `packages/utils/src/crypto.ts`)
- Key dari env `AUTH_ENCRYPTION_KEY` (32 bytes hex, 64 chars). Validate di config schema.
- Setiap `saveCreds` → serialize state → encrypt → upsert single row
- Setiap boot → load → decrypt → kasih ke Baileys
- Migration path dari `useMultiFileAuthState`: command CLI `npm run wa:import-auth -- ./auth_info_baileys` (one-shot tool, opsional)

### 8.3 Repos (`packages/db/src/repos/`)

Tipis sekali — bukan repository pattern penuh, hanya namespace untuk query yang sering:

- `userRepo.upsertByExternal(platform, externalId)`
- `groupRepo.getOrCreate(platform, externalId)`
- `reminderRepo.claimDue(limit)` — atomic update status pending→firing, return rows
- `reminderRepo.markDone(id)` / `markFailed(id, err)` / `incrementAttempt(id, err)`

Feature **boleh** akses `app.db` langsung untuk query ad-hoc; repos hanya untuk yang dipake >1 tempat.

### 8.4 SQLite WAL setup (`packages/db/src/client.ts`)

Saat init Prisma client, jalanin pragma sekali via raw query:

```ts
import { PrismaClient } from '@prisma/client';

export async function createPrismaClient(): Promise<PrismaClient> {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  return prisma;
}
```

| Pragma         | Nilai     | Alasan                                                                        |
| -------------- | --------- | ----------------------------------------------------------------------------- |
| `journal_mode` | `WAL`     | Reader ga block writer; survive crash; satu DB file + `*.db-wal` + `*.db-shm` |
| `synchronous`  | `NORMAL`  | Aman dgn WAL; faster than `FULL` (default), masih durable di crash OS         |
| `busy_timeout` | `5000` ms | Cegah `SQLITE_BUSY` error saat micro-contention dari async Prisma             |
| `foreign_keys` | `ON`      | SQLite default OFF (legacy); kita butuh untuk `onDelete: Cascade`             |

**Verify aktif** (acceptance §15.3): `sqlite3 bot.db "PRAGMA journal_mode;"` → `wal`.

**Catatan**: WAL bikin 3 file (`bot.db`, `bot.db-wal`, `bot.db-shm`). Backup harus include semua atau pakai SQLite Online Backup API (atomic, 1 file output). Spec backup (§12.8) udah pake API ini.

## 9. Scheduler, RateLimit, Logger, Errors

### 9.1 Scheduler (`packages/core/src/scheduler.ts`)

```ts
export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
  // scheduleOnce dipakai oleh feature lain di future (mis. announce, broadcast)
  scheduleOnce(at: Date, key: string, payload: unknown): Promise<void>;
}
```

- Implementasi pakai `croner`: `new Cron('*/30 * * * * *', tickHandler)` (tiap 30 detik).
- `tickHandler()` ambil due jobs dari `reminderRepo.claimDue(50)`, dispatch via `app.bus.emit('reminder.fire', row)`.
- Feature `remind` subscribe `'reminder.fire'` → kirim reply via adapter (resolve adapter dari `app.adapters` lookup by `platform`).
- Boot catchup: panggil `tickHandler()` 1x setelah adapter ready.

### 9.2 RateLimitRegistry (`packages/core/src/rate-limit.ts`)

```ts
export interface RateLimitRegistry {
  outbound(platform: Platform, chatId: string): import('bottleneck');
}
```

- Lazy-create `Bottleneck` per `(platform, chatId)`, eviction LRU (`lru-cache`, max 1000).
- WA default: `minTime: 800ms`, `maxConcurrent: 1`.
- Tele default: `minTime: 50ms` (Tele lebih longgar, batas 30 msg/sec global).
- Adapter `reply()` wajib lewat limiter: `limiter.schedule(() => sock.sendMessage(...))`.

### 9.3 Logger (`packages/utils/src/logger.ts`)

#### Destinations (multi-transport)

| Target       | Mode     | Format                                 | Konsumen                                             |
| ------------ | -------- | -------------------------------------- | ---------------------------------------------------- |
| stdout       | dev      | `pino-pretty` (multi-line, colorized)  | Terminal lokal saat `npm run dev`                    |
| stdout       | prod     | `pino-pretty` (single-line, colorized) | Pterodactyl Console tab — manusia, bukan log shipper |
| stdout       | test     | silent                                 | (no output)                                          |
| file rotated | dev/prod | JSON Lines                             | Audit, post-mortem, `jq`/`grep` query                |

**Rationale**: Pterodactyl Console = mata manusia. JSON wall ga readable. Tetep JSON di file untuk machine-parse. `singleLine: true` di prod cegah multi-line wrap di Console scroll.

**Invariant anti-missing**: aplikasi cuma boleh emit log lewat **satu root pino logger**. Pino transport fan-out event yang sama ke stdout + file. Dilarang log terminal manual (`console.*`) atau file manual (`fs.appendFile`) karena itu bikin terminal/file diverge. Setiap log punya `eventId` + `status` biar entry terminal bisa dicocokkan 1:1 dengan file JSON.

File path: `/home/container/data/log/bot-YYYY-MM-DD.log` (configurable via `LOG_DIR` env, default `/home/container/data/log`).

#### Rotation policy (`pino-roll`)

- Frequency: **daily** (`bot-2026-05-22.log`)
- Size cap: **50 MB** per file (mid-day rollover: `bot-2026-05-22.1.log`)
- Retention: **14 hari** (worst case ~700 MB di 8 GB disk panel — aman)

#### Levels per env

| `NODE_ENV`    | Default level | stdout format | colorize                             | singleLine                              |
| ------------- | ------------- | ------------- | ------------------------------------ | --------------------------------------- |
| `development` | `debug`       | `pino-pretty` | yes                                  | false (multi-line OK di terminal lebar) |
| `production`  | `info`        | `pino-pretty` | yes (Pterodactyl xterm support ANSI) | **true** (cegah scroll wrap)            |
| `test`        | `silent`      | (no output)   | —                                    | —                                       |

`LOG_LEVEL` env override default per env.

#### Mandatory fields per log entry

Auto-bound oleh `withTraceId` middleware (§6.2) ke `ctx.logger`:

```json
{
  "level": 30,
  "time": 1747900000000,
  "pid": 123,
  "eventId": "01JXLOG...",
  "traceId": "01JX...",
  "status": "ok",
  "platform": "wa",
  "userId": "628xxx@s.whatsapp.net",
  "chatId": "628xxx@s.whatsapp.net",
  "command": "ping",
  "feature": "general/ping",
  "msg": "command handled",
  "latencyMs": 42
}
```

`status` enum (semantic, beda dari `level`):

| Status   | Level default  | Meaning                                                    |
| -------- | -------------- | ---------------------------------------------------------- |
| `ok`     | `info`         | operasi sukses (`command handled`, adapter ready)          |
| `start`  | `info`         | boot/start phase (`adapter starting`, scheduler started)   |
| `stop`   | `info`         | graceful shutdown phase                                    |
| `denied` | `warn`         | guard reject (`owner only`, `group only`, cooldown)        |
| `retry`  | `warn`         | retryable failure (`adapter reconnecting`, reminder retry) |
| `skip`   | `debug`/`info` | intentionally ignored (`muted group`, disabled adapter)    |
| `error`  | `error`        | recoverable error, user got generic error w/ traceId       |
| `fatal`  | `fatal`        | process exiting / unrecoverable                            |

#### Consistency guarantee (terminal == file)

- **Single call**: handler calls `ctx.logger.info({ status: 'ok', ... }, 'pong')` once. Transport writes same event to stdout pretty + file JSON.
- **Same `eventId`**: stdout includes `eventId=...`; file JSON has `"eventId":"..."`.
- **Critical flush**: after `error`/`fatal`, call `await flushLogs(rootLogger, 2000)` before process exit / before error boundary finishes. Jadi error yang user lihat di terminal harus sudah masuk file log juga.
- **No direct sinks**: `console.*`, `process.stdout.write`, `fs.appendFile('*.log')` banned in app code except logger implementation.
- **Realtime target**: file log appears within <1s for normal logs; `error`/`fatal` guaranteed flushed by explicit flush path.

#### PII redaction

```ts
pino({
  level,
  redact: {
    paths: [
      '*.password',
      '*.token',
      'env.AUTH_ENCRYPTION_KEY',
      'env.TELEGRAM_BOT_TOKEN',
      'config.AUTH_ENCRYPTION_KEY',
      'config.TELEGRAM_BOT_TOKEN',
    ],
    remove: true,
  },
});
```

#### Crash flush

```ts
const finalHandler = pino.final(rootLogger, (err, finalLogger) => {
  finalLogger.fatal({ err }, 'uncaught');
  process.exit(1);
});
process.on('uncaughtException', finalHandler);
process.on('unhandledRejection', finalHandler);
```

Plus di `shutdown.ts`: `await new Promise<void>((res) => rootLogger.flush(res))` sebelum `process.exit(0)`.

#### Implementation skeleton

```ts
// packages/utils/src/logger.ts
import pino, { type Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';

export function createRootLogger(opts: {
  level: string;
  env: 'development' | 'production' | 'test';
  logDir: string;
}): Logger {
  mkdirSync(opts.logDir, { recursive: true });

  const targets: pino.TransportTargetOptions[] = [];

  // stdout (skip in test)
  if (opts.env === 'development') {
    targets.push({
      target: 'pino-pretty',
      level: opts.level,
      options: {
        colorize: !opts.noColor,
        translateTime: 'SYS:HH:MM:ss.l',
        singleLine: false,
        ignore: 'pid,hostname',
      },
    });
  } else if (opts.env === 'production') {
    // Pterodactyl Console = human eyes; tetap pretty + colorized + singleLine
    targets.push({
      target: 'pino-pretty',
      level: opts.level,
      options: {
        colorize: !opts.noColor,
        translateTime: 'SYS:HH:MM:ss.l',
        singleLine: true,
        ignore: 'pid,hostname,time', // time udah di-translateTime prefix
        messageFormat:
          '[{platform}] {feature} {status} → {msg} traceId={traceId} eventId={eventId}',
      },
    });
  }

  // rotated file (skip in test)
  if (opts.env !== 'test') {
    targets.push({
      target: 'pino-roll',
      level: opts.level,
      options: {
        file: join(opts.logDir, 'bot.log'),
        frequency: 'daily',
        size: '50m',
        limit: { count: 14 },
        mkdir: true,
        dateFormat: 'yyyy-MM-dd',
      },
    });
  }

  return pino(
    {
      level: opts.level,
      mixin() {
        return { eventId: ulid(), status: 'ok' };
      },
      redact: {
        paths: [
          '*.password',
          '*.token',
          'env.AUTH_ENCRYPTION_KEY',
          'env.TELEGRAM_BOT_TOKEN',
          'config.AUTH_ENCRYPTION_KEY',
          'config.TELEGRAM_BOT_TOKEN',
        ],
        remove: true,
      },
    },
    pino.transport({ targets }),
  );
}

export async function flushLogs(logger: Logger, timeoutMs = 2000): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve, reject) => logger.flush((err) => (err ? reject(err) : resolve()))),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('log flush timeout')), timeoutMs),
    ),
  ]);
}
```

`errorBoundary()` rule: setelah `ctx.logger.error({ status: 'error', err, traceId }, 'handler failed')`, panggil `await flushLogs(app.logger)` sebelum reply generic. Fatal path (`uncaughtException`, `SIGTERM`) wajib flush juga.

#### Anti-pattern guardrails (ESLint)

| Rule                                                | Scope                                                                  | Aksi                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `no-console`                                        | `packages/**`, `apps/**/src/**`                                        | error                                                          |
| `no-restricted-properties` (`process.stdout.write`) | `packages/**`, `apps/**/src/**`                                        | error — stdout cuma via logger transport                       |
| `no-restricted-imports` (`node:fs` log write)       | `packages/**`, `apps/**/src/**` kecuali `packages/utils/src/logger.ts` | error kalau dipakai untuk manual `.log` write                  |
| `no-restricted-imports` (root logger)               | `packages/features/**`                                                 | warn — feature **harus** pakai `ctx.logger`, bukan import root |
| `no-restricted-properties` (`ctx.raw`)              | `packages/features/**/index.ts` & `<cat>/<name>.ts`                    | warn (allowed di `tele.ts`/`wa.ts` post-MVP §16.3)             |

#### Kenapa unified log (bukan per-platform file)

- 1 traceId span lintas platform (mis. reminder.fire dari WA-set, user pindah ke Tele) → 1 file = 1 timeline
- Filter platform = query-time: `jq 'select(.platform=="wa")' bot-*.log` atau `grep ''"platform":"wa"''`
- Disk + rotation overhead 1 set, bukan 2
- Tooling (lnav, grafana loki, dll) standard JSON Lines

#### Disable color (kalau perlu)

Set `LOG_NO_COLOR=true` di `CUSTOM_ENVIRONMENT_VARIABLES` → adapter logger nge-set `colorize: false`. Berguna kalau:

- Pterodactyl Console rendering ANSI broken (rare)
- Log di-pipe ke `tee` external file dan ANSI escape bikin file kotor
- Visual preference

Default: colorize ON (Pterodactyl xterm.js handle ANSI fine).

### 9.4 Error model (`packages/core/src/errors.ts`)

```ts
export class BotError extends Error {
  constructor(
    public code: string,
    message: string,
    public meta?: object,
  ) {
    super(message);
  }
}
export class UserFacingError extends BotError {} // safe to show to user
export class GuardRejection extends BotError {} // middleware deny
export class CommandConflictError extends BotError {} // boot-time
```

`errorBoundary` middleware:

- `UserFacingError` → reply `error.message` apa adanya
- `GuardRejection` → reply pesan dari guard (mis. "owner only", "tunggu Ns")
- Lainnya → log full stack + traceId, reply `Terjadi kesalahan internal. Kode: {traceId}`

## 10. Config (`packages/utils/src/config.ts`)

`zod` schema, fail-fast di boot:

```ts
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  LOG_DIR: z.string().default('/home/container/data/log'),
  LOG_NO_COLOR: z.coerce.boolean().default(false),

  DATABASE_URL: z.string().default('file:/home/container/data/bot.db'),
  AUTH_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/, '32-byte hex required'),

  // WA
  WA_ENABLED: z.coerce.boolean().default(true),
  OWNER_WA: z.string().optional(), // e.g. "628xxx@s.whatsapp.net"
  WA_RATE_MIN_TIME_MS: z.coerce.number().int().default(800),

  // Tele
  TELE_ENABLED: z.coerce.boolean().default(true),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  OWNER_TG: z.string().optional(), // numeric user id as string
  TELE_RATE_MIN_TIME_MS: z.coerce.number().int().default(50),
});
export type AppConfig = z.infer<typeof ConfigSchema>;
export function loadConfig(): AppConfig {
  /* parse(process.env) → throw on fail */
}
```

Cross-validation:

- `WA_ENABLED && !OWNER_WA` → warn (owner cmds disabled di WA)
- `TELE_ENABLED && !TELEGRAM_BOT_TOKEN` → throw
- `TELE_ENABLED && !OWNER_TG` → warn

`.env.example` di-commit; `.env` di `.gitignore`.

## 11. Testing

- **Runner**: `vitest` (ESM, TS native, watch mode bagus).
- **Coverage**: `@vitest/coverage-v8`, threshold awal 60% (raise nanti).
- **Layer test**:
  - `packages/contracts` — type tests (`tsd` opsional, atau cukup compile check)
  - `packages/core` — unit: parser, registry, middleware, error mapping
  - `packages/features/*` — unit: handler dengan `createMockCtx()`, assert `ctx.reply` dipanggil dengan apa
  - `packages/adapters` — integration tier-2 (mock baileys/grammY emitter), bukan e2e
  - `packages/db` — pakai SQLite in-memory per test worker: `DATABASE_URL=file:memdb-${VITEST_POOL_ID}?mode=memory&cache=shared`, schema di-`prisma db push` ke memory DB saat setup
- **Faktori `createMockCtx`** di `packages/contracts/src/testing.ts`:
  - return MessageCtx with vitest spies for `reply/edit/delete/react`
  - configurable `platform`, `userId`, `isGroup`, `text`, dll
- **CI ready**: `npm run test` → `turbo run test`. CI config bukan MVP scope, tapi script siap.

## 12. Deploy: Pterodactyl Panel + GitHub Actions

### 12.1 Target environment

- Panel: Pterodactyl, egg `debian 12 universal` (auto git clone + auto npm/pnpm install + `.bash_profile` boot hook)
- Server resource: RAM 768 MB - 3.5 GiB, CPU 100-200%, disk 8 GiB (spec headroom)
- Network: 1 port allocated (e.g. `Tokoptero Network:7124`); **bot ga butuh inbound** (WA outbound socket, Tele long-poll). Cloudflare Tunnel egg variable: **off**.
- DB: SQLite file di volume `/home/container/data/bot.db` (zero infra extra; backup ikut container snapshot panel)
- Secret hygiene: `CUSTOM_ENVIRONMENT_VARIABLES` visible ke panel admin → trust panel admin atau rotate `AUTH_ENCRYPTION_KEY` saat migrasi hosting

### 12.2 Build & deploy flow (CI build, branch `deploy`)

```
[laptop] git push origin main
            └─> GitHub Actions (.github/workflows/deploy.yml)
                  ├─> npm ci
                  ├─> npm run build (turbo)
                  ├─> npx prisma generate
                  ├─> prune devDependencies
                  └─> push artifact (dist/, node_modules/, prisma/) → branch `deploy`

[panel] click Restart  (atau Schedule auto-restart, atau webhook)
            └─> egg AUTO_UPDATE=true → git pull origin deploy
            └─> egg npm install (idempotent, mostly cached)
            └─> exec /bin/bash -li → .bash_profile → npm start
                  ├─> npx prisma migrate deploy
                  └─> node apps/bot/dist/index.js
```

**Two branches:**

- `main` — source code, dev branch, CI runs from here
- `deploy` — build artifact (commits `dist/` + Prisma generated client). **Force-pushed** by CI (single-branch artifact, no history needed).

### 12.3 GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: Build & Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }

      - run: npm ci
      - run: npx prisma generate
      - run: npm run build # turbo run build → dist/ per package

      - name: Prepare deploy branch
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git checkout --orphan deploy
          git rm -rf --cached . >/dev/null 2>&1 || true
          git add -f \
            apps/*/dist apps/*/package.json \
            packages/*/dist packages/*/package.json \
            prisma node_modules \
            package.json package-lock.json turbo.json \
            .bash_profile
          git commit -m "deploy: GH_SHA_PLACEHOLDER"
          git push -f origin deploy
        env:
          GH_SHA_PLACEHOLDER: dummy # replace with ${{ github.sha }} di file actual
```

> **Note**: di file actual, ganti `GH_SHA_PLACEHOLDER` di commit message jadi `${{ github.sha }}` (literal Actions expression). Spec tulis pakai placeholder biar generator-friendly.

Catatan implementasi:

- `node_modules` di-commit utk skip install di server (egg masih bisa `npm install ${NPM_PACKAGES}` utk extra deps — kosongin). Trade-off: branch size besar, deploy 5x lebih cepet.
- Alternatif: skip commit `node_modules`, biarkan egg `npm install` saat boot. Lebih lambat tapi branch bersih. Switch saat repo size jadi masalah.

### 12.4 Pterodactyl egg variables

| Variable                       | Value                                        | Catatan                                                       |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------- |
| `GIT_REPO_ADDRESS`             | `https://github.com/<user>/bot-monorepo.git` | private repo: pakai `GIT_USERNAME` + `GIT_ACCESS_TOKEN` (PAT) |
| `INSTALL_BRANCH`               | `deploy`                                     | branch artifact, bukan `main`                                 |
| `AUTO_UPDATE`                  | `true`                                       | git pull tiap boot — aman karena CI gate                      |
| `CLOUDFLARE_TUNNEL`            | `false`                                      | bot ga butuh inbound                                          |
| `ENABLE_XVFB`                  | `false`                                      | no headless browser di MVP                                    |
| `NPM_PACKAGES`                 | (kosong)                                     | `node_modules` udah di artifact                               |
| `CUSTOM_ENVIRONMENT_VARIABLES` | lihat §12.5                                  | format `KEY=VAL;KEY=VAL`                                      |

### 12.5 Env config via panel

Format Pterodactyl: semicolon-separated. Contoh:

```
NODE_ENV=production;LOG_LEVEL=info;DATABASE_URL=file:/home/container/data/bot.db;AUTH_ENCRYPTION_KEY=<64-hex>;WA_ENABLED=true;OWNER_WA=628xxx@s.whatsapp.net;TELE_ENABLED=true;TELEGRAM_BOT_TOKEN=xxx:yyy;OWNER_TG=12345678;WA_RATE_MIN_TIME_MS=800;TELE_RATE_MIN_TIME_MS=50
```

**Validasi**: `loadConfig()` (zod) fail-fast saat boot kalau ada missing/invalid → exit 1 → panel mark offline + log alasan.

### 12.6 `.bash_profile` (committed di branch `deploy`)

```bash
# .bash_profile — auto-run saat bash login (egg-nya exec /bin/bash -li)
cd /home/container
exec npm start
```

`package.json` root scripts:

```json
{
  "scripts": {
    "start": "npx prisma migrate deploy && node apps/bot/dist/index.js",
    "start:wa": "npx prisma migrate deploy && node apps/wa/dist/index.js",
    "start:tele": "npx prisma migrate deploy && node apps/tele/dist/index.js",
    "dev": "turbo run dev --filter=@app/bot",
    "dev:wa": "turbo run dev --filter=@app/wa",
    "dev:tele": "turbo run dev --filter=@app/tele"
  }
}
```

Migrate jalan tiap boot (idempotent). `apps/bot/dist/index.js` = orchestrator entry (default Pterodactyl). `start:wa` / `start:tele` = standalone entry per platform untuk dev lokal atau future split (1 server panel per platform, ganti start cmd di `.bash_profile`).

### 12.7 Filesystem layout di Pterodactyl (`/home/container/`)

```
/home/container/
├── apps/
│   ├── bot/dist/index.js         # orchestrator entry (default `npm start`)
│   ├── wa/dist/index.js          # standalone WA entry (untuk `npm start:wa`)
│   └── tele/dist/index.js        # standalone Tele entry (untuk `npm start:tele`)
├── packages/*/dist/              # built packages
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── node_modules/                 # from CI artifact
├── .bash_profile                 # auto-run npm start
├── data/
│   ├── bot.db                    # SQLite + WAL files (bot.db-wal, bot.db-shm)
│   └── log/
│       ├── bot-2026-05-22.log    # daily rotated, JSON Lines
│       └── bot-2026-05-21.log    # retention 14 hari
├── backups/                      # panel Schedule writes here (sqlite3 .backup output)
└── .env                          # NOT used — env via panel CUSTOM_ENVIRONMENT_VARIABLES
```

### 12.8 Backup strategy

- **Primary**: tab **Backups** panel (full container snapshot — termasuk file). Schedule: daily, retention 7 hari.
- **DB**: SQLite file ikut tertangkap container snapshot. Hot backup (saat bot live) → pakai SQLite Online Backup API via Schedule task: `sqlite3 /home/container/data/bot.db ".backup '/home/container/backups/bot-$(date +%s).db'"` (atomic, tahan write concurrent dgn WAL).
- **Disaster recovery**: re-clone repo + restore DB dump + isi env panel + restart. Auth state Baileys ter-restore (encrypted blob di DB).

### 12.9 Graceful shutdown

Panel "Stop" → SIGTERM → wait 30s → SIGKILL. `apps/bot/src/shutdown.ts` wajib:

1. Pause adapters (stop accepting new messages)
2. Flush in-flight handlers (max 10s timeout)
3. `await prisma.$disconnect()`
4. `logger.flush()`
5. `process.exit(0)`

Kalo SIGKILL kena (>30s): aman karena state di DB. Tapi mid-write encrypted auth state risk corrupt → mitigation: gunakan `prisma.$transaction` untuk single-row upsert WAL bikin UPDATE atomic + journal di-replay saat next boot.

### 12.10 Trigger pindah dari Pterodactyl (exit criteria)

- Egg restart >3x/hari karena Baileys crash → split ke `worker_threads`, kalau ga cukup → pindah VPS docker-compose
- Butuh sidecar (Redis, Prometheus, dashboard web di port lain) → Pterodactyl 1-port limit jadi pain
- Resource > tier panel → migrate VPS

Catat di Decisions Log + Open Questions.

## 13. Decisions Log

| #   | Keputusan                                                                                                                                  | Alasan                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Single orchestrator process (`apps/bot/`)                                                                                                  | Pterodactyl 1 server = 1 process tree; EventBus in-mem trivial; scheduler dispatch lintas-platform tanpa IPC. Trade-off **accepted**: WA crash → Tele ikut down. Trigger split: §12.10.                                 |
| D2  | npm workspaces (bukan pnpm)                                                                                                                | Egg auto-install via `NPM_PACKAGES`; konsisten lokal & CI; pnpm bisa diganti nanti tanpa rewrite                                                                                                                        |
| D3  | SQLite + Prisma (WAL mode)                                                                                                                 | Zero infra extra di Pterodactyl; single-proc bikin write contention non-issue; WAL pragma satu-baris saat boot bikin reader-writer concurrent; container snapshot = backup; swap-able ke Postgres kalau migrate hosting |
| D4  | Baileys (bukan whatsapp-web.js)                                                                                                            | Production-grade, ringan, no chromium                                                                                                                                                                                   |
| D5  | grammY (bukan Telegraf)                                                                                                                    | TS-first, modern, plugin lengkap                                                                                                                                                                                        |
| D6  | `features/` (bukan `plugins/`)                                                                                                             | Jujur soal arsitektur: ini modul internal, bukan real plugin loader                                                                                                                                                     |
| D7  | Envelope-encrypted Baileys auth (key di env)                                                                                               | Honest framing: mitigation tier-1 (raise the bar dari plain JSON), bukan true encryption-at-rest. KMS post-MVP.                                                                                                         |
| D8  | `croner` + DB persistence (bukan setInterval)                                                                                              | Drift-aware + survive restart                                                                                                                                                                                           |
| D9  | `bottleneck` outbound limiter                                                                                                              | Cegah WA banned                                                                                                                                                                                                         |
| D10 | Smart parser via `yargs-parser`                                                                                                            | Hindari DIY parser bug                                                                                                                                                                                                  |
| D11 | Owner check via middleware uniform                                                                                                         | Hapus rule platform-specific prefix (review S1)                                                                                                                                                                         |
| D12 | Testing: vitest + mockCtx factory                                                                                                          | Standar 2026, ESM-friendly                                                                                                                                                                                              |
| D13 | Skip dulu: AI, sticker, downloader, OCR, QR, Redis, Postgres lokal, multi-instance, i18n, prom, health endpoint, CF Tunnel                 | YAGNI MVP                                                                                                                                                                                                               |
| D14 | Deploy: Pterodactyl single server, no CF tunnel                                                                                            | Bot full outbound (WA socket + Tele long-poll); 1-port allocation cukup; egg `universal` debian 12                                                                                                                      |
| D15 | Build via GitHub Actions → branch `deploy` (opsi C)                                                                                        | CI build artifact (`dist/` + `node_modules` + Prisma client) di-force-push ke `deploy`; egg `AUTO_UPDATE=true` pull tiap restart; deploy cepat tanpa devDeps di server                                                  |
| D16 | Auto-start via `.bash_profile` → `npm start`                                                                                               | Egg generic universal default `exec /bin/bash -li`; `.bash_profile` ng-trigger `npm start` (= `prisma migrate deploy && node apps/bot/dist/index.js`)                                                                   |
| D17 | Env via panel `CUSTOM_ENVIRONMENT_VARIABLES` (semicolon)                                                                                   | UI-driven, zero `.env` di server; trade-off: secret visible ke panel admin → rotate `AUTH_ENCRYPTION_KEY` saat migrasi hosting                                                                                          |
| D18 | `koa-compose` (bukan DIY composer)                                                                                                         | Battle-tested, ~2KB; hilangkan indecision spec lama                                                                                                                                                                     |
| D19 | Reminder claim atomic via `prisma.$transaction` + compare-and-swap (`WHERE status='pending'`)                                              | Cegah double-fire kalau scheduler tick overlap; state machine: pending → firing → done\|failed (+ retry)                                                                                                                |
| D20 | Logical split: `apps/{bot,wa,tele}` (orchestrator + 2 standalone entry)                                                                    | Folder clarity + dev experience (`npm run dev:wa`); deploy default tetap orchestrator (`apps/bot`); arsitektur ready buat true-split nanti tanpa rewrite                                                                |
| D21 | `MessageCtx.capabilities` flag + per-platform handler module (post-MVP)                                                                    | Jujur soal disparity Tele vs WA Baileys; feature shared text-only LCD; interactive UI defer ke `tele.ts`/`wa.ts` saat dibutuhkan (lihat §16)                                                                            |
| D22 | Features organized by access scope (`general`/`owner`/`group`), bukan domain                                                               | Discoverability instan, auto-guard by folder, `!help` natural grouping, mapping ke Tele BotFather scopes future. Path = semantic kontrak.                                                                               |
| D23 | Auto-guard injection di feature-loader, kategori hardcoded fail-fast                                                                       | Hilangkan boilerplate `requireOwner()` di tiap owner cmd; folder typo (`Owners/`) → throw `UnknownCategoryError` di boot, bukan silent skip                                                                             |
| D24 | Layout flat-by-default (`<cat>/<name>.ts`), escalate ke folder kalau multi-cmd / state / >300 LOC / per-platform                           | Hindari ceremony untuk command kecil (~50 LOC); folder dipakai cuma kalau worth (mis. `general/remind/`). Underscore prefix = loader skip (private helper)                                                              |
| D25 | Logger: pino dual-transport (stdout pretty + `pino-roll` JSON daily file 14d retention), unified `bot-YYYY-MM-DD.log` (bukan per-platform) | Pterodactyl Console buffer ga reliable; persistent log butuh utk audit/post-mortem; unified file = 1 traceId timeline lintas platform, filter platform = query-time via `jq`                                            |
| D26 | Log consistency invariant: one pino event fan-out ke stdout + file, every event has `eventId` + `status`, critical `error/fatal` flushed   | Cegah kondisi terminal ada error tapi file kosong. Same `eventId` = bisa cocokkan 1:1; flush path bikin error/fatal durable sebelum exit/reply generic                                                                  |

## 14. Open Questions / Follow-ups

- **OQ1**: Owner di grup admin commands — MVP `requireOwner()`. Future: turunkan ke "admin grup" via `requireGroupAdmin()` middleware (cek metadata grup).
- **OQ2**: Tele BotFather command list (`/setcommands`) — auto-sync dari registry? Bisa script `npm run tele:sync-commands` (post-MVP).
- **OQ3**: Multi-tenant WA (multiple sessions) — schema `WAAuthState.id` udah siap; loader belum. Post-MVP.
- **OQ4**: Antilink whitelist — domain whitelist per group config? Tambah field `antiLinkWhitelist String[]` (atau `Json`) saat fitur dikembangkan.
- **OQ5**: Fault isolation single-proc — kalau Baileys crash sering, eksperimen `worker_threads` per adapter sebelum split full multi-proc. Pterodactyl tetap kompatibel (1 main process, multi worker dalam proses yang sama).
- **OQ6**: Local dev DB — `file:./prisma/dev.db` di repo (`.gitignore`). Reset gampang: `rm prisma/dev.db && npx prisma migrate dev`. Test pakai `:memory:`.
- **OQ7**: KMS-managed `AUTH_ENCRYPTION_KEY` — saat ini di env panel (visible). Future: integrate Vault / Doppler / panel-side secret encryption (kalau Pterodactyl support).
- **OQ8**: Bottleneck eviction — saat ini cap LRU 1000 entry. Risk: eviction in-flight task. Mitigation post-MVP: eviction berbasis idle (>5min no task) bukan size-only, atau cap besar (10k) dengan log warning.
- **OQ9**: WA Business Cloud API — kalau button reliable di WA jadi requirement bisnis, migrate Baileys → adapter `wa-cloud/` (Meta resmi, butuh verified business). Refactor besar tapi MessageCtx port udah ready (capabilities flag tinggal di-set true).
- **OQ10**: Trigger eskalasi ke Pendekatan B/C (§16.3) — saat fitur interactive Tele >2, mulai pisah `tele.ts` per feature. Sebelum itu, text-only cukup.
- **OQ11**: Multi-axis kategori — kalau feature jumlahnya banyak per kategori (mis. `general/` punya 20 command), perlu sub-grouping domain (`general/utility/`, `general/fun/`, `general/info/`)? Saat itu loader tinggal naik 1 depth (`features/src/{general,owner,group}/<sub>/<feature>/`), tapi sekarang YAGNI. Trigger: 1 kategori >10 feature.
- **OQ12**: Kategori `group` → turunin auto-guard dari `requireOwner()` ke `requireGroupAdmin()` (cek metadata group: caller di list admin). Post-MVP setelah OQ1 selesai. Sebelumnya, `group/*` praktis = "owner-only di grup".

## 15. Acceptance Criteria (MVP done)

### 15.1 Local dev

- [ ] `npm install` di root sukses, semua workspace ter-link
- [ ] `npm run build` sukses (semua package compile, no TS error)
- [ ] `npm run test` sukses, coverage ≥ 60%
- [ ] `npm run dev` di laptop: WA QR muncul, scan, connected; Tele bot online (jika token diisi)
- [ ] Lint & format clean (`npm run lint`, `npm run format:check`)

### 15.2 Functional

- [ ] `!ping`, `!stats`, `!help`, `!help ping` jalan di kedua platform
- [ ] `!remind 1m test` → 1 menit kemudian bot kirim `test`
- [ ] Bot di-restart sebelum reminder due → reminder tetep delivered (catchup tick)
- [ ] Reminder claim atomic: simulasi 2 tick paralel ga double-fire (test integration `reminderRepo.claimDue` dengan `prisma.$transaction`)
- [ ] `!kick`, `!mute`, `!antilink`, `!welcome` jalan di grup (asumsi bot admin)
- [ ] WA auth state encrypted di DB (verify via `sqlite3 bot.db "SELECT hex(encryptedBlob) FROM WAAuthState"` → hex random bytes, bukan plain JSON)
- [ ] Owner-only command direject untuk non-owner di kedua platform
- [ ] `!help` hide owner-only commands + aliases-nya untuk non-owner
- [ ] Error di handler → user dapet pesan generic + traceId; log lengkap di console

### 15.3 Pterodactyl deploy

- [ ] GitHub Actions `deploy.yml` jalan saat push `main`, branch `deploy` ter-update
- [ ] Egg config: `INSTALL_BRANCH=deploy`, `AUTO_UPDATE=true`, `CLOUDFLARE_TUNNEL=false`, `ENABLE_XVFB=false`
- [ ] SQLite file dibuat di `/home/container/data/bot.db` saat first boot, `DATABASE_URL` di env
- [ ] Panel "Start" → bot online dalam 60s (cek log: "bot ready")
- [ ] `prisma migrate deploy` jalan saat boot, table created (verify: `sqlite3 bot.db ".tables"` via console panel)
- [ ] Panel "Stop" → graceful shutdown < 10s, exit 0 (cek log: "shutdown complete")
- [ ] Reminder survive panel Restart (created sebelum restart, fired setelah)
- [ ] Panel Schedule backup jalan, snapshot tersimpan
- [ ] `loadConfig()` fail-fast saat env invalid (test: kosongin `AUTH_ENCRYPTION_KEY` → panel mark offline + exit 1 dgn pesan jelas)
- [ ] Log file ter-create di `/home/container/data/log/bot-YYYY-MM-DD.log` saat boot
- [ ] Log entry JSON Lines berisi `eventId`, `status`, `traceId`, `platform`, `userId`, `chatId`, `command`, `feature` (verify: `tail -1 bot-*.log | jq`)
- [ ] Terminal pretty log menampilkan `status`, `traceId`, `eventId` (verify manual di Pterodactyl Console)
- [ ] Same-event fan-out: trigger `!ping`, copy `eventId` dari terminal, `grep <eventId> data/log/bot-*.log` ketemu 1 JSON entry yang sama
- [ ] Error durability: trigger handler error, terminal menampilkan `status=error`, file JSON punya `status":"error"` dgn `eventId` sama dalam <=2s sebelum generic reply selesai
- [ ] ESLint reject `console.*`, `process.stdout.write`, dan manual `.log` file writes di luar `packages/utils/src/logger.ts`
- [ ] PII redacted: `AUTH_ENCRYPTION_KEY` & `TELEGRAM_BOT_TOKEN` ga muncul di log saat config dump (verify: `grep -i "auth_encryption_key\|telegram_bot_token" bot-*.log` → kosong)
- [ ] Daily rotation: ganti tanggal sistem → log baru ke file tanggal baru, file lama tetap utuh
- [ ] Crash uncaught → file log punya entry level `fatal` + `status":"fatal"` sebelum proses exit

### 15.4 Architecture parity

- [ ] `npm run dev:wa` boot WA-only (Tele ga konek), `npm run dev:tele` boot Tele-only
- [ ] `npm start` (orchestrator) boot kedua adapter dgn AppContext shared
- [ ] `MessageCtx.capabilities` di-set akurat per platform (Tele full true, WA defensive false untuk button/list)
- [ ] ESLint rule deny `ctx.raw.*` di `packages/features/src/**/index.ts` (allowed di `tele.ts`/`wa.ts`)

### 15.5 Feature loader & categories

- [ ] Loader scan **flat** (`<cat>/<name>.ts`) + **folder** (`<cat>/<name>/index.ts`) → registry populated
- [ ] File/folder berawalan `_` di-skip (verify: `_loader.ts`, `_handlers.ts` ga register sbg feature)
- [ ] `*.test.ts` di-skip (verify: test file co-located ga register)
- [ ] Konflik flat + folder dgn nama sama (`ping.ts` + `ping/index.ts`) → boot throw `FeatureConflictError`
- [ ] `owner/*` command auto-injected `requireOwner()` (verify: non-owner panggil → `GuardRejection`)
- [ ] `group/*` command auto-injected `requireGroup()` + `requireOwner()` (verify: di DM → reject; di group non-owner → reject)
- [ ] Folder selain 3 kategori (mis. `features/src/foo/bar.ts`) → boot throw `UnknownCategoryError`
- [ ] Boot log: `loaded feature owner/eval (auto-guard: requireOwner) [flat]` (atau `[folder]`)
- [ ] `!help` non-owner → tidak menampilkan `owner/*` command (termasuk aliases)
- [ ] `!help <cmd>` → tampilkan `category` field

## 16. Interactive UI Strategy (button, list, edit, reaction)

### 16.1 Capability disparity

| UI element               | Telegram (grammY) | WhatsApp (Baileys)                                                                                        | Catatan              |
| ------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------- |
| Inline button (callback) | ✅ stable, native | ⚠️ unreliable (`buttonsMessage` deprecated 2022+, `interactiveMessage` hack tergantung region & versi WA) | Jangan andelin di WA |
| List/menu                | ✅ stable         | ⚠️ `listMessage` deprecated banyak region                                                                 | Sama                 |
| Reply keyboard           | ✅ stable         | ❌ konsep ga ada di WA                                                                                    | n/a                  |
| Edit message             | ✅                | ⚠️ multi-device only, terbatas window                                                                     | OK best-effort       |
| Reaction                 | ✅                | ✅ stable                                                                                                 | OK pakai             |
| Reply quote              | ✅                | ✅ stable                                                                                                 | OK pakai             |

**Verdict**: WA personal API (Baileys) **tidak cocok** untuk UX button-driven. Kalau bisnis butuh button reliable di WA → migrate ke **WhatsApp Business Cloud API** (adapter `wa-cloud/` baru, post-MVP, lihat OQ9).

### 16.2 MVP scope (v3 spec)

- Adapter set capability flag akurat (Tele full, WA defensive false)
- `ReplyOpts` MVP: `quote`, `mentions`, `media` doang. **Tidak ada `actions`/`buttons` di v3.**
- Feature handler shared pakai text + media + reactions only (LCD across platform)
- Reactions OK di kedua platform → dipake `errorBoundary` (✅ done) atau acknowledgement (mis. ✅ saat `!remind` accepted)

### 16.3 Post-MVP — per-platform handler module (Pendekatan C)

Saat lu butuh button (Tele primary), pisah handler:

```
packages/features/src/<feature>/
├── index.ts         # default — registerCommand(), text + media reply (semua platform)
├── tele.ts          # Tele-only enrichment: button, list, conversation flow
└── wa.ts            # (optional) WA-only — kalau ada hack worth, atau text fallback explicit
```

Loader:

- `index.ts` register command standar via `Feature.commands`
- `tele.ts` register additional listener via `EventBus` filtered `ctx.platform === 'tele'`, atau via Tele adapter hook khusus
- WA tetep degraded text-mode by default (no fake parity)

Aturan:

- **Feature shared (`index.ts`) DILARANG akses `ctx.raw`**. ESLint rule `no-restricted-properties` di `packages/features/src/*/index.ts`.
- Akses `ctx.raw.api.*` (grammY) atau `ctx.raw.sock.*` (Baileys) **HANYA** di file `tele.ts` / `wa.ts`.

### 16.4 Future — `actions` field di ReplyOpts (post-MVP, opt-in)

Kalo ada cukup feature butuh button cross-platform, extend kontrak:

```ts
export interface ReplyOpts {
  // ... existing
  actions?: ActionRow[];
}

export interface ActionRow {
  buttons: Array<
    { type: 'callback'; label: string; data: string } | { type: 'url'; label: string; url: string }
  >;
}
```

Adapter Tele full implement. Adapter WA: log warning + fallback text auto-numbered (`1) ...\n2) ...`) + parse user reply jadi pseudo-callback. **Trade-off didokumentasikan**: WA bukan first-class button platform.

Migration path callback handling: bikin `EventBus` event baru `'callback.invoked'` carry `{ data, ctx }`, feature subscribe.

### 16.5 Reaction sebagai cheap acknowledgement

Reaction native di kedua platform → pakai sebagai feedback ringan:

- `!remind 10m beli kopi` → bot react ✅ (instead of reply text "ok dijadwalkan")
- Error → react ❌
- Cooldown reject → react ⏳

Bikin UX consistent + hemat outbound message → bagus buat WA rate-limit.
