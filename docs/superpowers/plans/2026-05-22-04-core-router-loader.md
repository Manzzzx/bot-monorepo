# Core Router Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement parser, errors, middleware, event bus, command registry, feature loader, rate-limit registry, and router.

**Architecture:** Core owns orchestration and policy; it must not import Baileys or grammY. Feature loader applies category guards before registry registration.

**Tech Stack:** yargs-parser, koa-compose, lru-cache, bottleneck, ulid, Vitest.

---

## Files

- Create: `packages/core/src/{errors,parser,event-bus,command-registry,rate-limit,router}.ts`
- Create: `packages/core/src/middleware/{require-owner,require-group,cooldown,with-trace-id,error-boundary}.ts`
- Create: `packages/features/src/_loader.ts`
- Tests for each module

## Task 1: Parser + errors

- [ ] Add deps: `npm install yargs-parser koa-compose lru-cache bottleneck`.
- [ ] Implement `parseInput(text)` with prefix regex `^[!\/.](\S+)\s*(.*)$` and yargs-parser.
- [ ] Test `!ping`, `/help ping`, `.broadcast --group "hello world"`, non-command text.
- [ ] Implement errors: `BotError`, `UserFacingError`, `GuardRejection`, `CommandConflictError`, `UnknownCategoryError`, `FeatureConflictError`.

## Task 2: Middleware

- [ ] Implement `requireOwner()` using platform-specific owner config.
- [ ] Implement `requireGroup()` rejecting `!ctx.isGroup`.
- [ ] Implement `cooldown({ ms, scope })` with LRU.
- [ ] Implement `withTraceId()` binding traceId and child logger fields.
- [ ] Implement `errorBoundary(app)` logging unknown errors with `status:'error'`, calling `flushLogs(app.logger)`, replying generic trace code.
- [ ] Test each middleware using `createMockCtx()`.

## Task 3: Registry + event bus

- [ ] Implement `CommandRegistryImpl.register(feature, category)`.
- [ ] Index command names and aliases case-insensitively.
- [ ] Throw `CommandConflictError` on duplicate command/alias.
- [ ] Implement `resolve`, `list`, `byCategory`.
- [ ] Implement in-memory `EventBus` with `on()` and `emit()`.
- [ ] Test conflict, alias resolve, category grouping, async event handler.

## Task 4: Rate-limit registry

- [ ] Implement `RateLimitRegistryImpl.outbound(platform, chatId)` returning Bottleneck limiter.
- [ ] Use config minTime: WA `WA_RATE_MIN_TIME_MS`, Tele `TELE_RATE_MIN_TIME_MS`.
- [ ] Cache limiter by `${platform}:${chatId}`.
- [ ] Test same key returns same limiter; different platform/chat returns different limiter.

## Task 5: Feature loader

- [ ] Implement scan for flat `features/src/{general,owner,group}/!(_)*.ts`.
- [ ] Implement scan for folder `features/src/{general,owner,group}/!(_)*/index.ts`.
- [ ] Skip `_*.ts`, `*.test.ts`, `*.spec.ts`.
- [ ] Throw `UnknownCategoryError` for unknown category.
- [ ] Throw `FeatureConflictError` for `ping.ts` + `ping/index.ts` duplicate.
- [ ] Rewrite feature name to `${category}/${baseName}`.
- [ ] Inject auto-guards: owner -> `requireOwner`; group -> `requireGroup`, `requireOwner`.
- [ ] Log loaded feature with `[flat]` or `[folder]`.
- [ ] Test all loader rules with fixture files.

## Task 6: Router

- [ ] Implement dispatch pipeline: error boundary -> trace -> parser -> feature middleware -> command resolve -> guards -> handler.
- [ ] If message is not a command, emit `message` event and return.
- [ ] If command unknown, reply user-facing unknown command or no-op per spec decision.
- [ ] Test happy path, non-command event, unknown command, guard rejection, handler error.

## Task 7: Verify

- [ ] Run `npm run test -- --filter=@bot/core --filter=@bot/features`.
- [ ] Run `npm run build -- --filter=@bot/core --filter=@bot/features`.
- [ ] Run `git diff --stat`; do not commit unless user asks.
