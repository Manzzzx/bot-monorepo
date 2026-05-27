# Plan A: Providers Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buat `packages/providers/` (ProviderHub + HTTP client + circuit breaker + schemas) dan extend `contracts`/`core` (kategori baru + middleware `requireArgs`). Fully tested, wired ke `AppContext`. Belum ada fitur user-facing — itu Plan B & C.

**Architecture:** Provider abstraction layer dengan static fallback (siputzx → covenant). Per-provider Bottleneck queue + circuit breaker. Response normalized via zod schemas. Foundation ini standalone & testable; fitur tinggal panggil `app.providers.download(...)` / `.stalk(...)`.

**Tech Stack:** TypeScript strict ESM, undici (built-in Node 20), zod, bottleneck, vitest, koa-compose. No new npm dep selain pindahin yang udah ada.

**Spec reference:** `docs/superpowers/specs/2026-05-27-providers-downloader-stalker-design.md`

---

## File Structure

**Create:**
- `packages/providers/{package.json,tsconfig.json,vitest.config.ts}`
- `packages/providers/src/{index,types,errors,circuit,http,schemas,hub}.ts` + `*.test.ts`
- `packages/providers/src/siputzx/{index,endpoints}.ts`
- `packages/providers/src/covenant/{index,endpoints}.ts`
- `packages/core/src/middleware/require-args.ts` + `.test.ts`

**Modify:**
- `packages/contracts/src/feature.ts` — extend `FeatureCategory`, add `Command.examples`
- `packages/contracts/src/app-context.ts` — add `providers: ProviderHub`, env types
- `packages/core/src/command-registry.ts` — `emptyCategories()` baru
- `packages/core/src/index.ts` — export `requireArgs`
- `packages/features/src/_loader.ts` — `featureCategories`, `staticFeatureRegistry`, `guardFor`
- `packages/features/src/general/_registry.ts` — `categoryTitle`, `canSeeCommand`
- `packages/utils/src/config.ts` — env schema (provider config)
- `apps/bot/src/index.ts` (atau bootstrap.ts) — wire ProviderHub
- `apps/wa/src/start.ts`, `apps/tele/src/start.ts` — sama (kalau independen)
- `.env.example` — tambah `COVENANT_API_KEY`, `PROVIDER_*`

**Test convention:** `*.test.ts` colocated, vitest config sama dengan package lain.

---

## Task 1: Scaffold `@bot/providers` package

**Files:** `packages/providers/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@bot/providers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run --passWithNoTests",
    "lint": "eslint . --max-warnings=0"
  },
  "dependencies": {
    "@bot/contracts": "^0.0.0",
    "bottleneck": "^2.19.5",
    "pino": "^10.3.1",
    "undici": "^7.0.0",
    "zod": "^3.23.0"
  }
}
```

> Cek `npm ls zod pino undici` di root sebelum pin versi — match dengan lock-file existing.

- [ ] **Step 2: Create `tsconfig.json` (mirror packages/core)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`** — copy persis dari `packages/core/vitest.config.ts`.

- [ ] **Step 4: Create stub `src/index.ts`** dengan isi `export {};`

- [ ] **Step 5: Install & verify**

```
npm install
npm run build -w @bot/providers
```

- [ ] **Step 6: Commit**

```
git add packages/providers package.json package-lock.json
git commit -m "feat(providers): scaffold @bot/providers package"
```

---

## Task 2: Extend contracts (FeatureCategory + Command.examples)

**Files:** `packages/contracts/src/feature.ts`, `packages/core/src/command-registry.ts`

- [ ] **Step 1: Update `FeatureCategory` & `Command`**

```ts
// packages/contracts/src/feature.ts
export type FeatureCategory = 'general' | 'owner' | 'group' | 'downloader' | 'stalker';

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  examples?: string[];
  category?: FeatureCategory;
  guards?: Middleware[];
  handler(ctx: MessageCtx): Promise<void>;
}
```

- [ ] **Step 2: Update `emptyCategories()`**

```ts
// packages/core/src/command-registry.ts
function emptyCategories(): Record<FeatureCategory, RegisteredCommand[]> {
  return { general: [], owner: [], group: [], downloader: [], stalker: [] };
}
```

- [ ] **Step 3: Build & test**

```
npm run build -w @bot/contracts && npm run build -w @bot/core
npm run test -w @bot/contracts && npm run test -w @bot/core
```

Expected: PASS. Existing tests gak boleh regress.

- [ ] **Step 4: Commit**

```
git add packages/contracts packages/core
git commit -m "feat(contracts): add downloader/stalker categories and Command.examples"
```

---

## Task 3: `requireArgs` middleware

**Files:** `packages/core/src/middleware/require-args.ts`, `packages/core/src/middleware/require-args.test.ts`, `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/src/middleware/require-args.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Command, MessageCtx } from '@bot/contracts';
import { requireArgs } from './require-args.js';

function ctx(args: string[]): MessageCtx {
  return {
    platform: 'wa', messageId: 'm1', chatId: 'c1', userId: 'u1', isGroup: false,
    chatType: 'private', timestamp: Date.now(), capabilities: { buttons: false, list: false, edit: false, reactions: false },
    text: '/tt', command: 'tt', args, flags: {}, reply: vi.fn().mockResolvedValue(undefined),
    logger: { child: () => ({}) } as any, traceId: 't1', raw: {},
  } as unknown as MessageCtx;
}

const command: Command = {
  name: 'tiktok', description: 'Download TikTok video.', usage: '/tiktok <url>',
  examples: ['/tiktok https://vt.tiktok.com/abc'], handler: async () => {},
};

describe('requireArgs', () => {
  it('calls next when enough args', async () => {
    const c = ctx(['https://x.com']);
    (c as any).matchedCommand = { command };
    const next = vi.fn();
    await requireArgs(1)(c, next);
    expect(next).toHaveBeenCalledOnce();
  });
  it('replies usage and stops when args missing', async () => {
    const c = ctx([]);
    (c as any).matchedCommand = { command };
    const next = vi.fn();
    await requireArgs(1)(c, next);
    expect(next).not.toHaveBeenCalled();
    const msg = (c.reply as any).mock.calls[0][0] as string;
    expect(msg).toContain('/tiktok <url>');
    expect(msg).toContain('https://vt.tiktok.com/abc');
  });
  it('treats whitespace-only args as missing', async () => {
    const c = ctx(['   ']);
    (c as any).matchedCommand = { command };
    await requireArgs(1)(c, vi.fn());
    expect(c.reply).toHaveBeenCalledOnce();
  });
});
```

Run: `npm run test -w @bot/core -- require-args`
Expected: FAIL, module missing.

- [ ] **Step 2: Implement middleware**

```ts
// packages/core/src/middleware/require-args.ts
import type { Command, MessageCtx, Middleware, RegisteredCommand } from '@bot/contracts';

interface MatchedCtx { matchedCommand?: RegisteredCommand; }

function commandFrom(ctx: MessageCtx): Command {
  const matched = (ctx as MessageCtx & MatchedCtx).matchedCommand;
  if (matched) return matched.command;
  return { name: ctx.command ?? 'command', description: '', usage: `/${ctx.command ?? 'command'} <args>`, handler: async () => {} };
}

function usageMessage(command: Command): string {
  const lines = [
    command.description ? `📌 *${command.name}* — ${command.description}` : `📌 *${command.name}*`,
    '',
    `Cara pakai: \`${command.usage ?? '/' + command.name}\``,
  ];
  if (command.examples?.length) lines.push('', 'Contoh:', ...command.examples.map((example) => `• \`${example}\``));
  return lines.join('\n');
}

export function requireArgs(min: number): Middleware {
  return async (ctx, next) => {
    const count = ctx.args.filter((arg) => arg.trim().length > 0).length;
    if (count >= min) {
      await next();
      return;
    }
    await ctx.reply(usageMessage(commandFrom(ctx)));
  };
}
```

- [ ] **Step 3: Export**

Add to `packages/core/src/index.ts`:

```ts
export * from './middleware/require-args.js';
```

- [ ] **Step 4: Verify & commit**

Run: `npm run test -w @bot/core -- require-args && npm run build -w @bot/core`
Expected: PASS.

```bash
git add packages/core
git commit -m "feat(core): add requireArgs middleware"
```

---

## Task 4: Provider types, errors, schemas

**Files:** `packages/providers/src/{types,errors,schemas}.ts`, `packages/providers/src/schemas.test.ts`

- [ ] **Step 1: Write schema tests**

```ts
// packages/providers/src/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { DownloaderResultSchema, StalkerResultSchema } from './schemas.js';

describe('schemas', () => {
  it('accepts downloader result', () => {
    expect(DownloaderResultSchema.parse({ type: 'video', url: 'https://cdn/x.mp4' }).type).toBe('video');
  });
  it('rejects bad downloader url', () => {
    expect(() => DownloaderResultSchema.parse({ type: 'video', url: 'x' })).toThrow();
  });
  it('rejects unknown type', () => {
    expect(() => DownloaderResultSchema.parse({ type: 'foo', url: 'https://x/y' })).toThrow();
  });
  it('accepts stalker result with extra', () => {
    const result = StalkerResultSchema.parse({ username: 'octocat', extra: { repos: 8 } });
    expect(result.extra?.repos).toBe(8);
  });
  it('requires username', () => {
    expect(() => StalkerResultSchema.parse({})).toThrow();
  });
});
```

Run: `npm run test -w @bot/providers -- schemas`
Expected: FAIL.

- [ ] **Step 2: Implement `schemas.ts`**

```ts
import { z } from 'zod';

export const DownloaderResultSchema = z.object({
  type: z.enum(['video', 'audio', 'image', 'document']),
  url: z.string().url(),
  title: z.string().optional(),
  author: z.string().optional(),
  caption: z.string().optional(),
  durationSec: z.number().optional(),
  thumbnailUrl: z.string().url().optional(),
  sizeBytes: z.number().optional(),
});

export const StalkerResultSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  verified: z.boolean().optional(),
  private: z.boolean().optional(),
  followers: z.number().optional(),
  following: z.number().optional(),
  posts: z.number().optional(),
  url: z.string().url().optional(),
  extra: z.record(z.unknown()).optional(),
});
```

- [ ] **Step 3: Implement `errors.ts`**

```ts
export type ProviderErrorKind =
  | 'timeout' | 'http' | 'parse' | 'validation' | 'unauthorized'
  | 'rate_limit' | 'circuit_open' | 'unsupported';

export interface ProviderErrorOptions { status?: number; cause?: unknown; detail?: string; }

export class ProviderError extends Error {
  readonly status?: number;
  readonly detail?: string;
  constructor(
    readonly provider: string,
    readonly endpoint: string,
    readonly kind: ProviderErrorKind,
    options: ProviderErrorOptions = {},
  ) {
    super(
      `[${provider}] ${endpoint}: ${kind}` +
        (options.status ? ` (${options.status})` : '') +
        (options.detail ? ` - ${options.detail}` : ''),
      { cause: options.cause },
    );
    this.name = 'ProviderError';
    if (options.status !== undefined) this.status = options.status;
    if (options.detail !== undefined) this.detail = options.detail;
  }
}

export class ProviderUnavailableError extends Error {
  constructor(readonly service: string, readonly attempts: ProviderError[]) {
    super(`Service '${service}' unavailable after ${attempts.length} attempt(s)`);
    this.name = 'ProviderUnavailableError';
  }
}

export function shouldCountAsFailure(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return true;
  return ['timeout', 'http', 'rate_limit', 'parse'].includes(error.kind);
}
```

- [ ] **Step 4: Implement `types.ts`**

```ts
import type { z } from 'zod';
import type { DownloaderResultSchema, StalkerResultSchema } from './schemas.js';

export type ProviderName = 'siputzx' | 'covenant';
export type ProviderRole = 'primary' | 'fallback';

export type DownloaderService =
  | 'tiktok' | 'igdl' | 'fbdl' | 'twitter'
  | 'ytmp3' | 'ytmp4' | 'spotify' | 'pinterest' | 'sfile';

export type StalkerService =
  | 'instagram' | 'tiktok' | 'github' | 'twitter' | 'threads' | 'pinterest'
  | 'youtube' | 'roblox' | 'facebook' | 'freefire' | 'mlbb' | 'pixiv' | 'whatsapp';

export interface ProviderCapabilities {
  downloader: Partial<Record<DownloaderService, true>>;
  stalker: Partial<Record<StalkerService, true>>;
}

export interface DownloadQuery { url: string; }
export interface StalkQuery { username: string; }

export type DownloaderResult = z.infer<typeof DownloaderResultSchema>;
export type StalkerResult = z.infer<typeof StalkerResultSchema>;
export type TaggedResult<T> = T & { source: ProviderRole };

export interface ApiProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
  download(service: DownloaderService, query: DownloadQuery): Promise<DownloaderResult>;
  stalk(service: StalkerService, query: StalkQuery): Promise<StalkerResult>;
}
```

- [ ] **Step 5: Verify & commit**

Run: `npm run test -w @bot/providers -- schemas && npm run build -w @bot/providers`
Expected: PASS.

```bash
git add packages/providers
git commit -m "feat(providers): add types errors and schemas"
```

---

## Task 5: Circuit breaker

**Files:** `packages/providers/src/{circuit.ts,circuit.test.ts}`

- [ ] **Step 1: Write tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuit.js';

describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts closed', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    expect(cb.isOpen('p')).toBe(false);
  });
  it('opens after threshold consecutive failures', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    cb.recordFailure('p'); cb.recordFailure('p');
    expect(cb.isOpen('p')).toBe(false);
    cb.recordFailure('p');
    expect(cb.isOpen('p')).toBe(true);
  });
  it('resets counter on success', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    cb.recordFailure('p'); cb.recordFailure('p'); cb.recordSuccess('p');
    cb.recordFailure('p'); cb.recordFailure('p');
    expect(cb.isOpen('p')).toBe(false);
  });
  it('open → half-open after cooldown', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('p');
    expect(cb.isOpen('p')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(cb.isOpen('p')).toBe(false);
  });
  it('half-open failure re-opens', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('p');
    vi.advanceTimersByTime(1001);
    cb.isOpen('p');
    cb.recordFailure('p');
    expect(cb.isOpen('p')).toBe(true);
  });
  it('isolates per provider', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('a');
    expect(cb.isOpen('a')).toBe(true);
    expect(cb.isOpen('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { Logger } from 'pino';

export interface CircuitConfig { threshold: number; cooldownMs: number; }
type State = 'closed' | 'open' | 'half-open';
interface Entry { state: State; consecutiveFails: number; openedAt?: number; }

export class CircuitBreaker {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly config: CircuitConfig, private readonly logger?: Logger) {}

  isOpen(provider: string): boolean {
    const entry = this.entry(provider);
    if (entry.state !== 'open') return false;
    if (Date.now() - (entry.openedAt ?? 0) >= this.config.cooldownMs) {
      this.transition(provider, entry, 'half-open');
      return false;
    }
    return true;
  }

  recordSuccess(provider: string): void {
    const entry = this.entry(provider);
    entry.consecutiveFails = 0;
    if (entry.state !== 'closed') this.transition(provider, entry, 'closed');
  }

  recordFailure(provider: string): void {
    const entry = this.entry(provider);
    if (entry.state === 'half-open') {
      entry.openedAt = Date.now();
      this.transition(provider, entry, 'open');
      return;
    }
    entry.consecutiveFails += 1;
    if (entry.consecutiveFails >= this.config.threshold) {
      entry.openedAt = Date.now();
      this.transition(provider, entry, 'open');
    }
  }

  private entry(provider: string): Entry {
    let entry = this.entries.get(provider);
    if (!entry) {
      entry = { state: 'closed', consecutiveFails: 0 };
      this.entries.set(provider, entry);
    }
    return entry;
  }

  private transition(provider: string, entry: Entry, next: State): void {
    const prev = entry.state;
    if (prev === next) return;
    entry.state = next;
    if (next === 'closed') entry.consecutiveFails = 0;
    this.logger?.info(
      { component: 'providers.circuit', provider, transition: `${prev}→${next}` },
      'circuit transition',
    );
  }
}
```

- [ ] **Step 3: Verify & commit**

Run: `npm run test -w @bot/providers -- circuit && npm run build -w @bot/providers`
Expected: PASS.

```bash
git add packages/providers
git commit -m "feat(providers): add circuit breaker"
```

---

## Task 6: HTTP client

**Files:** `packages/providers/src/{http.ts,http.test.ts}`

- [ ] **Step 1: Write tests**

Test with `vi.mock('undici')`:

```ts
const requestMock = vi.fn();
vi.mock('undici', () => ({ request: requestMock }));

function jsonResponse(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: { json: async () => body } };
}
```

Required cases:
- `get()` parses 200 JSON.
- query params append to URL.
- 400 → `ProviderError.kind === 'validation'`.
- 401/403 → `unauthorized`.
- 429 → `rate_limit`.
- 5xx → `http`.
- `fetchBuffer()` returns `Buffer` + `mimeType` from response headers.
- `fetchBuffer()` over `maxBytes` throws `validation` with detail `file_too_large`.

Run: `npm run test -w @bot/providers -- http`
Expected: FAIL.

- [ ] **Step 2: Implement `HttpClient`**

```ts
import Bottleneck from 'bottleneck';
import { request } from 'undici';
import { ProviderError, type ProviderErrorKind } from './errors.js';
import type { ProviderName } from './types.js';

export interface HttpClientConfig { timeoutMs: number; minTimeMs: number; maxConcurrent: number; }
export interface HttpGetOpts { query?: Record<string, string>; headers?: Record<string, string>; timeoutMs?: number; }
export interface HttpFetchBufferOpts { maxBytes: number; timeoutMs?: number; headers?: Record<string, string>; }

function statusToKind(status: number): ProviderErrorKind {
  if (status === 400) return 'validation';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limit';
  return 'http';
}

function buildUrl(url: string, query?: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query ?? {})) parsed.searchParams.set(key, value);
  return parsed.toString();
}

export class HttpClient {
  private readonly limiters = new Map<string, Bottleneck>();
  constructor(private readonly config: HttpClientConfig) {}

  async get<T>(provider: ProviderName, url: string, opts: HttpGetOpts = {}): Promise<T> {
    return this.limiter(provider).schedule(async () => {
      const fullUrl = buildUrl(url, opts.query);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.timeoutMs);
      try {
        const response = await request(fullUrl, { method: 'GET', headers: opts.headers ?? {}, signal: controller.signal });
        if (response.statusCode >= 400) throw new ProviderError(provider, url, statusToKind(response.statusCode), { status: response.statusCode });
        return (await response.body.json()) as T;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as { name?: string }).name === 'AbortError') throw new ProviderError(provider, url, 'timeout', { cause: error });
        throw new ProviderError(provider, url, 'http', { cause: error });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async fetchBuffer(url: string, opts: HttpFetchBufferOpts): Promise<{ buffer: Buffer; mimeType: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.timeoutMs);
    try {
      const response = await request(url, { method: 'GET', headers: opts.headers ?? {}, signal: controller.signal });
      if (response.statusCode >= 400) throw new ProviderError('-', url, statusToKind(response.statusCode), { status: response.statusCode });
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response.body as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > opts.maxBytes) throw new ProviderError('-', url, 'validation', { detail: 'file_too_large' });
        chunks.push(chunk);
      }
      return { buffer: Buffer.concat(chunks), mimeType: (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private limiter(provider: string): Bottleneck {
    let limiter = this.limiters.get(provider);
    if (!limiter) {
      limiter = new Bottleneck({ minTime: this.config.minTimeMs, maxConcurrent: this.config.maxConcurrent });
      this.limiters.set(provider, limiter);
    }
    return limiter;
  }
}
```

- [ ] **Step 3: Verify & commit**

Run: `npm run test -w @bot/providers -- http && npm run build -w @bot/providers`
Expected: PASS.

```bash
git add packages/providers
git commit -m "feat(providers): add HTTP client"
```

---

## Task 7: Provider skeletons

**Files:** `packages/providers/src/siputzx/{index,endpoints}.ts`, `packages/providers/src/covenant/{index,endpoints}.ts`

- [ ] **Step 1: Siputzx endpoints**

```ts
export const SIPUTZX_BASE = 'https://api.siputzx.my.id';
export const SIPUTZX_DOWNLOADER: Record<string, string> = {};
export const SIPUTZX_STALKER: Record<string, string> = {};
```

- [ ] **Step 2: Siputzx class**

```ts
import type { Logger } from 'pino';
import type { HttpClient } from '../http.js';
import { ProviderError } from '../errors.js';
import type { ApiProvider, DownloaderResult, DownloaderService, DownloadQuery, ProviderCapabilities, ProviderName, StalkerResult, StalkerService, StalkQuery } from '../types.js';

export interface SiputzxOptions { http: HttpClient; logger?: Logger; }

export class SiputzxProvider implements ApiProvider {
  readonly name: ProviderName = 'siputzx';
  readonly capabilities: ProviderCapabilities = { downloader: {}, stalker: {} };
  constructor(private readonly options: SiputzxOptions) {}
  async download(service: DownloaderService, _query: DownloadQuery): Promise<DownloaderResult> {
    throw new ProviderError(this.name, `download/${service}`, 'unsupported', { detail: 'not_implemented' });
  }
  async stalk(service: StalkerService, _query: StalkQuery): Promise<StalkerResult> {
    throw new ProviderError(this.name, `stalk/${service}`, 'unsupported', { detail: 'not_implemented' });
  }
}
```

- [ ] **Step 3: Covenant endpoints**

```ts
export const COVENANT_BASE = 'https://api.covenant.sbs';
export const COVENANT_DOWNLOADER: Record<string, string> = {};
export const COVENANT_STALKER: Record<string, string> = {};
```

- [ ] **Step 4: Covenant class**

Use same shape as `SiputzxProvider`, but:

```ts
export interface CovenantOptions { http: HttpClient; apiKey: string; logger?: Logger; }
export class CovenantProvider implements ApiProvider {
  readonly name: ProviderName = 'covenant';
  readonly capabilities: ProviderCapabilities = { downloader: {}, stalker: {} };
  constructor(private readonly options: CovenantOptions) {}
  protected authHeaders(): Record<string, string> { return { 'x-api-key': this.options.apiKey }; }
  // same unsupported download/stalk methods as siputzx
}
```

- [ ] **Step 5: Verify & commit**

Run: `npm run build -w @bot/providers`
Expected: PASS.

```bash
git add packages/providers
git commit -m "feat(providers): add provider skeletons"
```

---

## Task 8: ProviderHub fallback orchestration

**Files:** `packages/providers/src/{hub.ts,hub.test.ts,index.ts}`

- [ ] **Step 1: Write hub tests**

Required cases:
- primary success → `source: 'primary'`.
- primary HTTP error + fallback success → `source: 'fallback'`.
- primary validation error → throw; fallback not called.
- both fail → `ProviderUnavailableError`.
- capability false → skip provider.
- provider is `null` → skip provider.
- circuit open → skip provider.
- non-validation failure calls `breaker.recordFailure()`.

Use helper:

```ts
function provider(name: 'siputzx' | 'covenant', download: any, caps = { downloader: { tiktok: true }, stalker: {} }): ApiProvider {
  return { name, capabilities: caps as any, download: vi.fn(download), stalk: vi.fn() } as ApiProvider;
}
```

- [ ] **Step 2: Implement `hub.ts`**

```ts
import type { Logger } from 'pino';
import { CircuitBreaker } from './circuit.js';
import { ProviderError, ProviderUnavailableError, shouldCountAsFailure } from './errors.js';
import type { ApiProvider, DownloaderResult, DownloaderService, DownloadQuery, ProviderName, ProviderRole, StalkerResult, StalkerService, StalkQuery, TaggedResult } from './types.js';

export interface ProviderHubConfig {
  providers: Record<ProviderName, ApiProvider | null>;
  priority: { primary: ProviderName; fallback: ProviderName };
  breaker: CircuitBreaker;
  logger?: Logger;
}

export class ProviderHub {
  constructor(private readonly config: ProviderHubConfig) {}

  download(service: DownloaderService, query: DownloadQuery): Promise<TaggedResult<DownloaderResult>> {
    return this.dispatch('download', service, query, (provider) => Boolean(provider.capabilities.downloader[service])) as Promise<TaggedResult<DownloaderResult>>;
  }

  stalk(service: StalkerService, query: StalkQuery): Promise<TaggedResult<StalkerResult>> {
    return this.dispatch('stalk', service, query, (provider) => Boolean(provider.capabilities.stalker[service])) as Promise<TaggedResult<StalkerResult>>;
  }

  private async dispatch(op: 'download' | 'stalk', service: string, query: DownloadQuery | StalkQuery, supports: (provider: ApiProvider) => boolean): Promise<TaggedResult<DownloaderResult> | TaggedResult<StalkerResult>> {
    const attempts: ProviderError[] = [];
    for (const role of ['primary', 'fallback'] as ProviderRole[]) {
      const providerName = this.config.priority[role];
      const provider = this.config.providers[providerName];
      if (!provider || !supports(provider)) continue;
      if (this.config.breaker.isOpen(providerName)) {
        attempts.push(new ProviderError(providerName, `${op}/${service}`, 'circuit_open'));
        continue;
      }
      try {
        const result = op === 'download'
          ? await provider.download(service as DownloaderService, query as DownloadQuery)
          : await provider.stalk(service as StalkerService, query as StalkQuery);
        this.config.breaker.recordSuccess(providerName);
        return { ...(result as object), source: role } as TaggedResult<DownloaderResult>;
      } catch (error) {
        if (error instanceof ProviderError && (error.kind === 'validation' || error.kind === 'unauthorized')) throw error;
        if (shouldCountAsFailure(error)) this.config.breaker.recordFailure(providerName);
        attempts.push(error instanceof ProviderError ? error : new ProviderError(providerName, `${op}/${service}`, 'http', { cause: error }));
      }
    }
    throw new ProviderUnavailableError(service, attempts);
  }
}
```

- [ ] **Step 3: Barrel export**

```ts
export * from './errors.js';
export * from './types.js';
export * from './schemas.js';
export * from './circuit.js';
export * from './http.js';
export * from './hub.js';
export { SiputzxProvider } from './siputzx/index.js';
export { CovenantProvider } from './covenant/index.js';
```

- [ ] **Step 4: Verify & commit**

Run: `npm run test -w @bot/providers -- hub && npm run build -w @bot/providers`
Expected: PASS.

```bash
git add packages/providers
git commit -m "feat(providers): add ProviderHub fallback orchestration"
```

---

## Task 9: Provider port in AppContext

**Files:** `packages/contracts/src/app-context.ts`

- [ ] **Step 1: Add provider-like contracts**

Do **not** import `ProviderHub` into contracts. Avoid circular package hell.

```ts
export type ProviderSource = 'primary' | 'fallback';

export interface AppDownloadResult {
  type: 'video' | 'audio' | 'image' | 'document';
  url: string;
  title?: string;
  author?: string;
  caption?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  sizeBytes?: number;
  source: ProviderSource;
}

export interface AppStalkerResult {
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  verified?: boolean;
  private?: boolean;
  followers?: number;
  following?: number;
  posts?: number;
  url?: string;
  extra?: Record<string, unknown>;
  source: ProviderSource;
}

export interface ProviderHubPort {
  download(service: string, query: { url: string }): Promise<AppDownloadResult>;
  stalk(service: string, query: { username: string }): Promise<AppStalkerResult>;
}
```

- [ ] **Step 2: Add to `AppContext`**

```ts
providers: ProviderHubPort;
```

- [ ] **Step 3: Verify & commit**

Run: `npm run build -w @bot/contracts && npm run build -w @bot/core`
Expected: PASS.

```bash
git add packages/contracts
git commit -m "feat(contracts): add ProviderHub port to AppContext"
```

---

## Task 10: Provider env config

**Files:** `packages/contracts/src/app-context.ts`, `packages/utils/src/config.ts`, `.env.example`

- [ ] **Step 1: Add AppConfig fields**

```ts
COVENANT_API_KEY?: string | undefined;
PROVIDER_PRIMARY: 'siputzx' | 'covenant';
PROVIDER_FALLBACK: 'siputzx' | 'covenant';
PROVIDER_HTTP_TIMEOUT_MS: number;
PROVIDER_RATE_MIN_TIME_MS: number;
PROVIDER_MAX_CONCURRENT: number;
PROVIDER_CIRCUIT_THRESHOLD: number;
PROVIDER_CIRCUIT_COOLDOWN_MS: number;
PROVIDER_DOWNLOAD_MAX_BYTES: number;
```

- [ ] **Step 2: Add zod defaults**

In `packages/utils/src/config.ts` env schema:

```ts
COVENANT_API_KEY: z.string().optional(),
PROVIDER_PRIMARY: z.enum(['siputzx', 'covenant']).default('siputzx'),
PROVIDER_FALLBACK: z.enum(['siputzx', 'covenant']).default('covenant'),
PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
PROVIDER_RATE_MIN_TIME_MS: z.coerce.number().int().nonnegative().default(250),
PROVIDER_MAX_CONCURRENT: z.coerce.number().int().positive().default(4),
PROVIDER_CIRCUIT_THRESHOLD: z.coerce.number().int().positive().default(5),
PROVIDER_CIRCUIT_COOLDOWN_MS: z.coerce.number().int().positive().default(60000),
PROVIDER_DOWNLOAD_MAX_BYTES: z.coerce.number().int().positive().default(104857600),
```

Add post-parse validation:

```ts
.refine((data) => data.PROVIDER_PRIMARY !== data.PROVIDER_FALLBACK, {
  message: 'PROVIDER_PRIMARY and PROVIDER_FALLBACK must differ',
})
```

- [ ] **Step 3: Update `.env.example`**

```env
# Providers
# COVENANT_API_KEY=
PROVIDER_PRIMARY=siputzx
PROVIDER_FALLBACK=covenant
PROVIDER_HTTP_TIMEOUT_MS=15000
PROVIDER_RATE_MIN_TIME_MS=250
PROVIDER_MAX_CONCURRENT=4
PROVIDER_CIRCUIT_THRESHOLD=5
PROVIDER_CIRCUIT_COOLDOWN_MS=60000
PROVIDER_DOWNLOAD_MAX_BYTES=104857600
```

- [ ] **Step 4: Verify & commit**

Run: `npm run build -w @bot/contracts && npm run build -w @bot/utils && npm run test -w @bot/utils`
Expected: PASS.

```bash
git add packages/contracts packages/utils .env.example
git commit -m "feat(config): add provider env defaults"
```

---

## Task 11: Bootstrap ProviderHub

**Files:** locate AppContext builder first. Expected candidates: `apps/bot/src/index.ts`, `apps/wa/src/start.ts`, `apps/tele/src/start.ts`.

- [ ] **Step 1: Locate builder**

Run: `rg -n "AppContext|createRouter|loadFeatures|const app" apps packages -g "*.ts"`
Expected: exact file(s) assembling AppContext.

- [ ] **Step 2: Add imports**

```ts
import { CircuitBreaker, CovenantProvider, HttpClient, ProviderHub, SiputzxProvider } from '@bot/providers';
```

- [ ] **Step 3: Construct providers**

Add after `config` and `logger` exist:

```ts
const providerHttp = new HttpClient({
  timeoutMs: config.PROVIDER_HTTP_TIMEOUT_MS,
  minTimeMs: config.PROVIDER_RATE_MIN_TIME_MS,
  maxConcurrent: config.PROVIDER_MAX_CONCURRENT,
});

const siputzx = new SiputzxProvider({
  http: providerHttp,
  logger: logger.child({ provider: 'siputzx' }),
});

const covenant = config.COVENANT_API_KEY
  ? new CovenantProvider({
      http: providerHttp,
      apiKey: config.COVENANT_API_KEY,
      logger: logger.child({ provider: 'covenant' }),
    })
  : null;

if (!covenant) {
  logger.warn({ component: 'providers' }, 'COVENANT_API_KEY missing — covenant disabled');
}

const providers = new ProviderHub({
  providers: { siputzx, covenant },
  priority: { primary: config.PROVIDER_PRIMARY, fallback: config.PROVIDER_FALLBACK },
  breaker: new CircuitBreaker(
    { threshold: config.PROVIDER_CIRCUIT_THRESHOLD, cooldownMs: config.PROVIDER_CIRCUIT_COOLDOWN_MS },
    logger.child({ component: 'providers.circuit' }),
  ),
  logger: logger.child({ component: 'providers' }),
});
```

- [ ] **Step 4: Include in AppContext object**

```ts
const app: AppContext = {
  // existing fields
  providers,
};
```

- [ ] **Step 5: Verify & commit**

Run: `npm run build`
Expected: PASS.

Run: `npm run dev:tele`
Expected: bot boots; optional covenant-disabled warning.

```bash
git add apps packages
git commit -m "feat(app): wire ProviderHub into AppContext"
```

---

## Task 12: Extend feature loader and visibility

**Files:** `packages/features/src/_loader.ts`, `packages/features/src/general/_registry.ts`

- [ ] **Step 1: Extend loader categories**

```ts
const featureCategories = ['general', 'owner', 'group', 'downloader', 'stalker'] as const satisfies readonly FeatureCategory[];
```

In `staticFeatureRegistry`, add:

```ts
downloader: [],
stalker: [],
```

Keep `guardFor()` default return as `none`; no special guard for downloader/stalker.

- [ ] **Step 2: Extend titles**

```ts
export function categoryTitle(category: FeatureCategory): string {
  if (category === 'general') return 'General';
  if (category === 'owner') return 'Owner';
  if (category === 'group') return 'Group';
  if (category === 'downloader') return 'Downloader';
  if (category === 'stalker') return 'Stalker';
  return category;
}
```

- [ ] **Step 3: Visibility stays public**

```ts
export function canSeeCommand(
  entry: RegisteredCommand,
  ctx: MessageCtx,
  app: Pick<AppContext, 'config'>,
): boolean {
  if (entry.category === 'owner' && !isOwner(ctx, app)) return false;
  if (entry.category === 'group' && !ctx.isGroup) return false;
  return true;
}
```

- [ ] **Step 4: Verify & commit**

Run: `npm run build -w @bot/features && npm run test -w @bot/features`
Expected: PASS.

```bash
git add packages/features
git commit -m "feat(features): add downloader and stalker categories"
```

---

## Task 13: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Lint touched packages**

Run: `npm run lint -w @bot/providers && npm run lint -w @bot/core && npm run lint -w @bot/contracts && npm run lint -w @bot/features`
Expected: PASS.

- [ ] **Step 4: Smoke boot**

Run: `npm run dev:tele`
Expected: boot ok, no provider crash, optional covenant warning.

- [ ] **Step 5: Final status**

Run: `git status --short`
Expected: clean except intended commits.

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| `packages/providers` scaffold | Task 1 |
| FeatureCategory + examples | Task 2 |
| `requireArgs` | Task 3 |
| Provider errors/types/schemas | Task 4 |
| Circuit breaker | Task 5 |
| HTTP client | Task 6 |
| Provider skeletons | Task 7 |
| ProviderHub fallback | Task 8 |
| AppContext provider surface | Task 9 |
| Provider env config | Task 10 |
| App wiring | Task 11 |
| loader/menu/help category support | Task 12 |
| verification | Task 13 |

**Out of Plan A:** actual downloader/stalker command files, service endpoint maps, provider normalizers, media fetch flow. Those are Plan B/C.

**Risk resolved:** no direct `@bot/contracts -> @bot/providers` import. Contracts exposes a duck-typed `ProviderHubPort`; `ProviderHub` implementation remains assignable.
