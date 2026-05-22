# Contracts Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the type-only contracts package used by core, adapters, features, and tests.

**Architecture:** Contracts define boundaries, not behavior. Keep runtime side effects out; allow type-only imports only.

**Tech Stack:** TypeScript strict ESM, pino types, Vitest spies.

---

## Files

- Create: `packages/contracts/src/platform.ts`
- Create: `packages/contracts/src/message-ctx.ts`
- Create: `packages/contracts/src/feature.ts`
- Create: `packages/contracts/src/app-context.ts`
- Create: `packages/contracts/src/testing.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/testing.test.ts`

## Task 1: Message context contract

- [ ] **Step 1: Create `platform.ts`**

```ts
export type Platform = 'wa' | 'tele';
export interface PlatformCapabilities {
  buttons: boolean;
  list: boolean;
  edit: boolean;
  reactions: boolean;
}
```

- [ ] **Step 2: Create `message-ctx.ts`**

Define `MediaRef`, `ReplyOpts`, `MessageCtx<TRaw=unknown>` with exact fields from `docs/tech-spec.md` §3: platform, messageId, chatId, userId, isGroup, timestamp, capabilities, text, command, args, flags, replyToId, media, reply/edit/delete/react, logger, traceId, raw.

- [ ] **Step 3: Build**

Run: `npm run build -- --filter=@bot/contracts`.

Expected: types compile.

## Task 2: Feature + app context contracts

- [ ] **Step 1: Create `feature.ts`**

Define: `FeatureCategory`, `EventName`, `Middleware`, `Command`, `EventSubscription`, `Feature`. Cooldown must not be a field; it is middleware in `guards`.

- [ ] **Step 2: Create `app-context.ts`**

Define: `AppConfig`, `MessageAdapter`, `AdapterRegistry`, `RegisteredCommand`, `CommandRegistry`, `EventBus`, `Scheduler`, `RateLimitRegistry`, `AppContext`.

- [ ] **Step 3: Export all contracts**

`packages/contracts/src/index.ts`:

```ts
export * from './platform.js';
export * from './message-ctx.js';
export * from './feature.js';
export * from './app-context.js';
export * from './testing.js';
```

## Task 3: Testing helper

- [ ] **Step 1: Create `testing.ts`**

Implement `createMockCtx(overrides?: Partial<MessageCtx>): MessageCtx` with Vitest spies for reply/edit/delete/react/logger methods.

- [ ] **Step 2: Create `testing.test.ts`**

Test: override command/text, call `ctx.reply('pong')`, assert spy called.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test -- --filter=@bot/contracts
npm run build -- --filter=@bot/contracts
```

Expected: pass.
