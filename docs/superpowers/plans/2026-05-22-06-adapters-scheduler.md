# Adapters Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement WhatsApp/Telegram adapters, adapter registry, scheduler, app bootstrap, and graceful shutdown.

**Architecture:** Adapters own native clients and convert updates to `MessageCtx`. Scheduler uses DB claim + EventBus. Apps compose packages into runtime entries.

**Tech Stack:** Baileys, grammY, croner, Bottleneck, Prisma, pino.

---

## Files

- Create: `packages/adapters/src/registry.ts`
- Create: `packages/adapters/src/wa/{auth-state,context,adapter}.ts`
- Create: `packages/adapters/src/tele/{context,adapter}.ts`
- Create: `packages/core/src/scheduler.ts`
- Create: `apps/bot/src/{index,bootstrap,shutdown}.ts`
- Create: `apps/wa/src/{index,start}.ts`
- Create: `apps/tele/src/{index,start}.ts`

## Task 1: Adapter registry + rate-limited send

- [ ] Implement adapter registry: `register(adapter)`, `get(platform)`, `has(platform)`.
- [ ] Test missing adapter throws and registered adapter resolves.
- [ ] Ensure all adapter send paths call `app.rateLimit.outbound(platform, chatId).schedule(...)`.

## Task 2: WhatsApp adapter

- [ ] Add dependency: `npm install @whiskeysockets/baileys`.
- [ ] Implement Prisma-backed encrypted Baileys auth state using `WAAuthState` + AES helpers.
- [ ] Implement WA `MessageCtx` builder with capabilities `{ buttons:false, list:false, edit:true, reactions:true }`.
- [ ] Implement `reply`, `react`, `delete`, media lazy download.
- [ ] Implement reconnect exponential backoff; `DisconnectReason.loggedOut` stops reconnect and logs terminal state.
- [ ] Unit test context builder with mocked Baileys event.

## Task 3: Telegram adapter

- [ ] Add deps: `npm install grammy @grammyjs/conversations`.
- [ ] Implement Tele `MessageCtx` builder with capabilities `{ buttons:true, list:true, edit:true, reactions:true }`.
- [ ] Implement long polling by default; no webhook, no Cloudflare tunnel.
- [ ] Implement `reply`, `edit`, `delete`, `react` best effort through grammY API.
- [ ] Unit test context builder with mocked grammY update.

## Task 4: Scheduler

- [ ] Add dep: `npm install croner`.
- [ ] Implement `Scheduler.start()` with Cron `*/30 * * * * *`.
- [ ] Tick: `reminderRepo.claimDue(prisma, 50, new Date())` then emit `reminder.fire` for each row.
- [ ] Implement boot catchup: call tick once after adapters ready.
- [ ] Test tick emits due reminder events.

## Task 5: App bootstrap

- [ ] Implement `apps/bot/src/bootstrap.ts`: load config, create logger, create Prisma, create bus/scheduler/rateLimit/registry/adapters, load features, start enabled adapters.
- [ ] Implement `apps/wa/src/start.ts` export `registerWA(app)`.
- [ ] Implement `apps/tele/src/start.ts` export `registerTele(app)`.
- [ ] Implement `apps/bot/src/index.ts`, `apps/wa/src/index.ts`, `apps/tele/src/index.ts` entries.
- [ ] Test bootstrap with adapters disabled and mocked services.

## Task 6: Graceful shutdown

- [ ] Implement SIGTERM/SIGINT handler in `apps/bot/src/shutdown.ts`.
- [ ] Shutdown order: pause adapters, stop scheduler, wait in-flight max 10s, disconnect Prisma, flush logger, exit 0.
- [ ] Test shutdown ordering with mocks.

## Task 7: Verify

- [ ] Run `npm run build -- --filter=@bot/adapters --filter=@app/bot --filter=@app/wa --filter=@app/tele`.
- [ ] Run `npm run test -- --filter=@bot/adapters --filter=@app/bot`.
- [ ] Run `git diff --stat`; do not commit unless user asks.
