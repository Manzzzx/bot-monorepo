# Providers (Downloader + Stalker) — Design Spec

- **Status**: Draft v1
- **Date**: 2026-05-27
- **Owner**: @manzz
- **Scope**: Tambah dua kategori fitur baru (`downloader`, `stalker`) yang ngepanggil provider HTTP eksternal (Siputzx + Covenant). Kenalin `packages/providers/` sebagai layer abstraksi dengan fallback chain, circuit breaker, response normalization, dan capability flag. Tambah middleware `requireArgs` + field `examples` di `Command`. Tidak menyentuh fitur existing.

## 1. Tujuan

- **Single call surface**: fitur cuma manggil `app.providers.download(service, query)` / `app.providers.stalk(service, query)`. Tau-tau dapet response normalized.
- **Fallback transparan**: provider primary (siputzx) gagal/timeout → otomatis fallback ke covenant. Kalau dua-duanya gagal → throw `ProviderUnavailableError` → handler reply error standar.
- **Resilient**: per-provider circuit breaker (5 fail / 60s cooldown) cegah hammering provider yang lagi flapping.
- **Type-safe response**: tiap kategori punya schema zod normalized. Provider response yang berubah kena di satu file (`schemas.ts` / `normalizers/`).
- **Zero new HTTP dep**: pake `undici` (built-in Node 20). Ada Bottleneck untuk outbound rate-limit per provider.
- **Drop-in feature**: `_loader.ts` cukup tambah dua kategori, fitur existing untouched.
- **UX konsisten**: command tanpa args otomatis kasih usage + contoh via middleware `requireArgs`.

Non-goal: kategori AI/Search/Tools/Anime/Primbon/Fun. Streaming download. Multi-tier fallback (>2 providers). Health-based routing. Distributed circuit state.

## 2. Stack tambahan

| Layer            | Pilihan                            | Alasan |
| ---------------- | ---------------------------------- | ------ |
| HTTP client      | `undici` (built-in Node 20)        | Zero dep, native, Pool/Agent control, performant |
| Validation       | `zod` (existing)                   | Schema response normalization |
| Rate limit       | `bottleneck` (existing)            | Outbound queue per provider |
| Cache (optional) | `lru-cache` (existing) — fase 2    | Stalker response cache (TTL pendek) |

Tidak ada package npm baru. Semua leverage yang udah ada.

## 3. Struktur folder baru

```
packages/providers/
├── package.json                  # name: @bot/providers
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                  # barrel: ProviderHub, errors, schemas
    ├── types.ts                  # ApiProvider, ProviderConfig, ProviderRole, capability map
    ├── errors.ts                 # ProviderError, ProviderUnavailableError
    ├── http.ts                   # undici dispatcher + Bottleneck per provider + retry-on-timeout(off)
    ├── circuit.ts                # CircuitBreaker (per-provider, in-memory)
    ├── hub.ts                    # ProviderHub: download(), stalk(), wiring
    ├── schemas.ts                # DownloaderResultSchema, StalkerResultSchema (zod)
    ├── siputzx/
    │   ├── index.ts              # SiputzxProvider class
    │   ├── endpoints.ts          # endpoint URL constants
    │   └── normalizers/
    │       ├── downloader.ts     # raw siputzx → DownloaderResult, per-service
    │       └── stalker.ts        # raw siputzx → StalkerResult, per-service
    ├── covenant/
    │   ├── index.ts              # CovenantProvider class
    │   ├── endpoints.ts
    │   └── normalizers/
    │       ├── downloader.ts
    │       └── stalker.ts
    └── *.test.ts                 # unit + contract tests (mocked HTTP)

packages/features/src/
├── downloader/
│   ├── _shared.ts                # url validate, size guard helper, error→reply mapper, caption builder
│   ├── tiktok.ts
│   ├── igdl.ts
│   ├── fbdl.ts
│   ├── twitter.ts
│   ├── ytmp3.ts
│   ├── ytmp4.ts
│   ├── spotify.ts
│   ├── pinterest.ts
│   └── sfile.ts
└── stalker/
    ├── _shared.ts                # username validate, formatter helpers
    ├── igstalk.ts
    ├── ttstalk.ts
    ├── ghstalk.ts
    ├── twitterstalk.ts
    ├── threadsstalk.ts
    ├── pinstalk.ts
    ├── ytstalk.ts
    ├── robloxstalk.ts
    ├── fbstalk.ts
    ├── ffstalk.ts
    ├── mlstalk.ts
    ├── pixivstalk.ts
    └── wastalk.ts
```

## 4. Provider Hub architecture

### 4.1 Tipe inti

```ts
// types.ts
export type ProviderName = 'siputzx' | 'covenant';
export type ProviderRole = 'primary' | 'fallback';
export type DownloaderService =
  | 'tiktok' | 'igdl' | 'fbdl' | 'twitter'
  | 'ytmp3' | 'ytmp4' | 'spotify' | 'pinterest' | 'sfile';
export type StalkerService =
  | 'instagram' | 'tiktok' | 'github' | 'twitter' | 'threads'
  | 'pinterest' | 'youtube' | 'roblox'
  | 'facebook' | 'freefire' | 'mlbb' | 'pixiv' | 'whatsapp';

export interface ProviderCapabilities {
  downloader: Partial<Record<DownloaderService, true>>;
  stalker: Partial<Record<StalkerService, true>>;
}

export interface ApiProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
  download(service: DownloaderService, query: DownloadQuery): Promise<DownloaderResult>;
  stalk(service: StalkerService, query: StalkQuery): Promise<StalkerResult>;
}

export interface DownloadQuery { url: string; }
export interface StalkQuery { username: string; }
```

### 4.2 ProviderHub

```ts
// hub.ts
export class ProviderHub {
  constructor(
    private providers: Record<ProviderName, ApiProvider | null>, // null = disabled
    private priority: { primary: ProviderName; fallback: ProviderName },
    private breaker: CircuitBreaker,
    private logger: Logger,
  ) {}

  async download(service: DownloaderService, q: DownloadQuery): Promise<TaggedResult<DownloaderResult>> {
    return this.dispatch('download', service, q, (p) => p.capabilities.downloader[service]);
  }

  async stalk(service: StalkerService, q: StalkQuery): Promise<TaggedResult<StalkerResult>> {
    return this.dispatch('stalk', service, q, (p) => p.capabilities.stalker[service]);
  }

  private async dispatch<T>(...): Promise<TaggedResult<T>> {
    const attempts: ProviderError[] = [];
    for (const role of ['primary', 'fallback'] as const) {
      const name = this.priority[role];
      const provider = this.providers[name];
      if (!provider) continue;                                      // disabled (no api key)
      if (!cap(provider)) continue;                                 // capability mismatch
      if (this.breaker.isOpen(name)) { attempts.push(circuitErr); continue; }
      try {
        const result = await provider[op](service, q);
        this.breaker.recordSuccess(name);
        return { ...result, source: role };                         // tag source
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'validation') throw err; // user fault
        if (shouldCountAsFailure(err)) this.breaker.recordFailure(name);
        attempts.push(err);
      }
    }
    throw new ProviderUnavailableError(service, attempts);
  }
}

export type TaggedResult<T> = T & { source: ProviderRole };
```

### 4.3 Wiring di bootstrap

```ts
// apps/bot/src/bootstrap.ts (extension)
const siputzx = new SiputzxProvider({ http });
const covenant = config.COVENANT_API_KEY
  ? new CovenantProvider({ http, apiKey: config.COVENANT_API_KEY })
  : null;

if (!covenant) logger.warn('COVENANT_API_KEY missing — covenant disabled, no fallback');

app.providers = new ProviderHub(
  { siputzx, covenant },
  { primary: config.PROVIDER_PRIMARY, fallback: config.PROVIDER_FALLBACK },
  new CircuitBreaker({ threshold: 5, cooldownMs: 60_000 }),
  logger.child({ component: 'providers' }),
);
```

## 5. HTTP layer

```ts
// http.ts
import { Pool, request } from 'undici';
import Bottleneck from 'bottleneck';

export interface HttpClient {
  get<T>(provider: ProviderName, url: string, opts?: HttpOpts): Promise<T>;
  fetchBuffer(url: string, opts?: HttpOpts): Promise<{ buffer: Buffer; mimeType: string }>;
}

interface HttpOpts {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;        // default config.PROVIDER_HTTP_TIMEOUT_MS (15_000)
  signal?: AbortSignal;
  expectJson?: boolean;      // default true
}
```

- **Pool per host**: `new Pool('https://api.siputzx.my.id')` & `new Pool('https://api.covenant.sbs')`. Keep-alive, max connections 8.
- **Bottleneck per provider**: `minTime: PROVIDER_RATE_MIN_TIME_MS` (default 250), `maxConcurrent: 4`.
- **Timeout**: hard 15s default, configurable.
- **No auto retry**: circuit breaker + fallback handle resilience. Retry pada single provider counterproductive (provider gratisan).
- **Error mapping**: timeout → `ProviderError(kind='timeout')`. Status 4xx → `kind='validation'` (400) atau `kind='unauthorized'` (401/403) atau `kind='rate_limit'` (429). Status 5xx → `kind='http'`. Parse fail → `kind='parse'`.

`fetchBuffer(url)` dipake hub setelah dapet `result.url` dari provider — buat download media file. Tidak via Bottleneck provider (URL CDN beda host). Hard cap 100MB sebelum balik ke handler:

```ts
async fetchBuffer(url: string, opts) {
  const res = await request(url, { method: 'GET', signal: ... });
  if (res.statusCode >= 400) throw new ProviderError(...);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > 100 * 1024 * 1024) throw new ProviderError('-', url, 'validation', undefined, 'file_too_large');
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), mimeType: res.headers['content-type'] ?? 'application/octet-stream' };
}
```

## 6. Circuit breaker

```ts
// circuit.ts
type State = 'closed' | 'open' | 'half-open';

interface BreakerEntry { state: State; consecutiveFails: number; openedAt?: number; }

export class CircuitBreaker {
  constructor(private cfg: { threshold: number; cooldownMs: number }) {}
  isOpen(name: ProviderName): boolean { /* transition open→half-open setelah cooldown */ }
  recordSuccess(name: ProviderName): void { /* reset counter, close */ }
  recordFailure(name: ProviderName): void { /* incr counter, open kalau >= threshold */ }
}
```

- **Transition**:
  - `closed` + fail → counter++. Counter ≥ threshold → `open` + set `openedAt`.
  - `open` + cek setelah cooldown → `half-open`. Ijinkan 1 request trial.
  - `half-open` + success → `closed`, counter=0.
  - `half-open` + fail → `open` lagi, fresh `openedAt`.
- **Yang dihitung sebagai fail**: `kind in {timeout, http, rate_limit, parse}`. Network error juga.
- **Yang TIDAK dihitung**: `kind in {validation, unauthorized, unsupported}` — itu user/config fault, bukan provider down.
- **In-memory only** untuk fase 1. Restart bot → state reset (akeptabel).
- Log warn saat open, info saat close. Pake structured field `circuit.transition`.

## 7. Error taxonomy

```ts
// errors.ts
export type ProviderErrorKind =
  | 'timeout' | 'http' | 'parse'
  | 'validation' | 'unauthorized' | 'rate_limit'
  | 'circuit_open' | 'unsupported';

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public endpoint: string,
    public kind: ProviderErrorKind,
    public status?: number,
    public cause?: unknown,
  ) { super(`[${provider}] ${endpoint}: ${kind}${status ? ` (${status})` : ''}`); }
}

export class ProviderUnavailableError extends Error {
  constructor(public service: string, public attempts: ProviderError[]) {
    super(`Service '${service}' unavailable after ${attempts.length} attempt(s)`);
    this.name = 'ProviderUnavailableError';
  }
}
```

**Mapping ke user reply** (di feature handler via `_shared.ts`):

| Error kind                  | User message                                              |
| --------------------------- | --------------------------------------------------------- |
| `validation` (URL invalid)  | `❌ Link gak valid. Contoh: <usage>`                       |
| `validation` (file_too_large) | `⚠️ File terlalu besar (>100MB). Coba pake link langsung.` |
| `ProviderUnavailableError`  | `⚠️ Service lagi gak available, coba lagi nanti.`         |
| `rate_limit` (loud)         | `⏳ Lagi banyak request, tunggu sebentar ya.`             |
| `unauthorized` (covenant)   | `⚠️ Service config error, hubungin owner.` (log error)    |

## 8. Response normalization (schemas)

```ts
// schemas.ts
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
export type DownloaderResult = z.infer<typeof DownloaderResultSchema>;

export const StalkerResultSchema = z.object({
  username: z.string(),
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
export type StalkerResult = z.infer<typeof StalkerResultSchema>;
```

Tiap provider punya `normalizers/<kind>.ts` yang map raw response → schema. Validate dengan zod sebelum return. Kalau parse fail → `ProviderError(kind='parse')`.

## 9. Endpoint catalog

### 9.1 Downloader

7 dual-provider + 2 covenant-only:

| Command       | Service       | Siputzx endpoint               | Covenant endpoint               | Mode |
| ------------- | ------------- | ------------------------------ | ------------------------------- | ---- |
| `/tiktok`     | `tiktok`      | `/api/d/tiktok`                | `/api/downloader/tiktok`        | dual |
| `/igdl`       | `igdl`        | `/api/d/igram` (primary, `/api/d/sssinstagram` cadangan dalam provider) | `/api/downloader/instagram` | dual |
| `/fbdl`       | `fbdl`        | `/api/d/facebook`              | `/api/downloader/facebook`      | dual |
| `/twitter`    | `twitter`     | `/api/d/twitter` (primary, `/api/d/ssstwiter` cadangan dalam provider) | `/api/downloader/twitter` | dual |
| `/ytmp3`      | `ytmp3`       | `/api/d/savefrom` (filter audio dari hasil) | `/api/downloader/yt` (audio mode) | dual |
| `/ytmp4`      | `ytmp4`       | `/api/d/savefrom` (filter video dari hasil) | `/api/downloader/yt` (video mode) | dual |
| `/spotify`    | `spotify`     | `/api/d/spotifyv2` (primary), `/api/d/spotify` (cadangan internal) | `/api/downloader/aio` (route spotify) | dual |
| `/pinterest`  | `pinterest`   | —                              | `/api/downloader/pinterest`     | covenant-only |
| `/sfile`      | `sfile`       | —                              | `/api/downloader/sfile`         | covenant-only |

> Catatan: "cadangan dalam provider" = beberapa siputzx endpoint punya 2 implementasi (mis. `igram` + `sssinstagram` dua-duanya support Instagram). Pilihan primer di-handle di normalizer level (try yang lebih stable dulu); kalau gagal lempar `ProviderError` → hub fallback ke covenant. **Bukan** chain panjang lintas provider.
> 
> Untuk command `covenant-only`: kalau `COVENANT_API_KEY` kosong → command tetap teregister tapi handler langsung reply `⚠️ Service lagi gak available...` (no fallback). Kalau circuit covenant open → sama treatment.

### 9.2 Stalker

| Command         | Service      | Siputzx                     | Covenant                  | Mode |
| --------------- | ------------ | --------------------------- | ------------------------- | ---- |
| `/igstalk`      | `instagram`  | `/api/stalk/instagram`      | `/api/stalk/instagram`    | dual |
| `/ttstalk`      | `tiktok`     | `/api/stalk/tiktok`         | `/api/stalk/tiktok`       | dual |
| `/ghstalk`      | `github`     | `/api/stalk/github`         | —                         | siputzx-only |
| `/twitterstalk` | `twitter`    | `/api/stalk/twitter`        | `/api/stalk/twitter`      | dual |
| `/threadsstalk` | `threads`    | `/api/stalk/threads`        | `/api/stalk/threads`      | dual |
| `/pinstalk`     | `pinterest`  | `/api/stalk/pinterest`      | `/api/stalk/pinterest`    | dual |
| `/ytstalk`      | `youtube`    | `/api/stalk/youtube`        | —                         | siputzx-only |
| `/robloxstalk`  | `roblox`     | `/api/stalk/roblox`         | —                         | siputzx-only |
| `/fbstalk`      | `facebook`   | —                           | `/api/stalk/facebook`     | covenant-only |
| `/ffstalk`      | `freefire`   | —                           | `/api/stalk/freefire`     | covenant-only |
| `/mlstalk`      | `mlbb`       | —                           | `/api/stalk/mlbb`         | covenant-only |
| `/pixivstalk`   | `pixiv`      | —                           | `/api/stalk/pixiv`        | covenant-only |
| `/wastalk`      | `whatsapp`   | —                           | `/api/stalk/whatsapp`     | covenant-only |

Single-provider commands: kalau provider-nya disabled (covenant tanpa apikey) atau circuit open → reply error standar.

## 10. Fallback policy

- **Static priority** dari config: `PROVIDER_PRIMARY=siputzx`, `PROVIDER_FALLBACK=covenant`. Owner bisa swap via env.
- **Order of attempts**:
  1. Skip provider yang `null` (disabled karena no api key).
  2. Skip yang capability false untuk service.
  3. Skip yang circuit open.
  4. Try primary → fail (non-validation) → fallback.
- **Validation errors short-circuit**: 400 (URL invalid), `file_too_large`, 401/403 (config issue) → throw langsung, jangan fallback.
- **Tag injection**: result `{ ...normalized, source: 'primary' | 'fallback' }`.

## 11. Feature integration

### 11.1 `FeatureCategory` extension

```ts
// packages/contracts/src/feature.ts
export type FeatureCategory = 'general' | 'owner' | 'group' | 'downloader' | 'stalker';
```

### 11.2 `_loader.ts` perubahan

- Tambah `'downloader'` & `'stalker'` di `featureCategories` const.
- `guardFor()` — dua kategori baru return `{ guards: [], label: 'none' }` (sama kayak general).
- `staticFeatureRegistry` tambah dua entry list.

### 11.3 `_registry.ts` perubahan

- `categoryTitle()` — tambah `'Downloader'` & `'Stalker'`.
- `canSeeCommand()` — visible untuk semua user di chat type apapun (sama treatment kayak general).
- `/help` & `/menu` otomatis pick up via `byCategory()` iteration.

### 11.4 Feature skeleton

```ts
// downloader/tiktok.ts
import type { Feature, Command } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { appFromCtx } from '../_registry.js';
import { requireArgs } from '@bot/core';
import { handleDownloadResult, handleProviderError, validateUrl } from './_shared.js';

const command: Command = {
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Download video TikTok.',
  usage: '/tiktok <url>',
  examples: ['/tiktok https://vt.tiktok.com/ZSjXNEnbC/'],
  guards: [requireArgs(1)],
  async handler(ctx) {
    const app = appFromCtx(ctx);
    const url = ctx.args[0]!;
    if (!validateUrl(url, /tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/)) {
      return reply(ctx, '❌ Link bukan TikTok yang valid.');
    }
    try {
      const result = await app.providers.download('tiktok', { url });
      await handleDownloadResult(ctx, result, app);
    } catch (err) {
      await handleProviderError(ctx, err, command);
    }
  },
};

const tiktokFeature: Feature = { name: 'tiktok', version: '1.0.0', commands: [command] };
export default tiktokFeature;
```

### 11.5 Caption builder (di `downloader/_shared.ts`)

```ts
export function buildCaption(result: DownloaderResult & { source: ProviderRole }, header: string): string {
  const lines = [header];
  if (result.author) lines.push(`👤 ${result.author}`);
  if (result.title) lines.push(`📌 ${truncate(result.title, 200)}`);
  if (result.durationSec) lines.push(`⏱️ ${formatDuration(result.durationSec)}`);
  if (result.caption) lines.push('', truncate(result.caption, 300));
  lines.push('', `_source: ${result.source}_`);
  return lines.join('\n');
}
```

## 12. Auto-help middleware

### 12.1 `Command.examples` field (additive)

```ts
// packages/contracts/src/feature.ts
export interface Command {
  name: string;
  aliases?: string[];
  description?: string;
  usage?: string;
  examples?: string[];          // NEW (optional)
  category?: FeatureCategory;
  guards?: Middleware[];
  handler: CommandHandler;
}
```

### 12.2 `requireArgs(min)` di `packages/core`

```ts
// packages/core/src/middleware/require-args.ts
export function requireArgs(min: number): Middleware {
  return async function requireArgsMiddleware(ctx, next) {
    const valid = ctx.args.filter((a) => a.trim().length > 0);
    if (valid.length < min) {
      const cmd = currentCommand(ctx);                      // resolve from registry+raw text
      await replyUsage(ctx, cmd);
      return;                                                // stop chain
    }
    await next();
  };
}
```

### 12.3 `replyUsage()` formatter

```ts
export async function replyUsage(ctx: MessageCtx, cmd: Command): Promise<void> {
  const lines = [
    `📌 *${cmd.name}* — ${cmd.description ?? ''}`.trim(),
    '',
    `Cara pakai: \`${cmd.usage ?? '/' + cmd.name}\``,
  ];
  if (cmd.examples?.length) {
    lines.push('', 'Contoh:', ...cmd.examples.map((e) => `• \`${e}\``));
  }
  await reply(ctx, lines.join('\n'));
}
```

- Opt-in per-command via `guards: [requireArgs(N)]`. Fitur existing untouched.
- `currentCommand(ctx)` resolve via registry. Kalau gak ketemu → fallback minimal usage message.

## 13. AppContext & Config

### 13.1 `AppContext` extension

```ts
// packages/contracts/src/app-context.ts
import type { ProviderHub } from '@bot/providers';

export interface AppContext<TDb = unknown> {
  config: AppConfig;
  logger: Logger;
  db: TDb;
  bus: EventBus;
  scheduler: Scheduler;
  rateLimit: RateLimitRegistry;
  registry: CommandRegistry;
  adapters: AdapterRegistry;
  providers: ProviderHub;       // NEW
}
```

### 13.2 `AppConfig` env tambahan

```ts
COVENANT_API_KEY?: string;                  // optional; absent → covenant disabled
PROVIDER_PRIMARY: ProviderName;             // default 'siputzx'
PROVIDER_FALLBACK: ProviderName;            // default 'covenant'
PROVIDER_HTTP_TIMEOUT_MS: number;           // default 15000
PROVIDER_RATE_MIN_TIME_MS: number;          // default 250
PROVIDER_MAX_CONCURRENT: number;            // default 4
PROVIDER_CIRCUIT_THRESHOLD: number;         // default 5
PROVIDER_CIRCUIT_COOLDOWN_MS: number;       // default 60000
PROVIDER_DOWNLOAD_MAX_BYTES: number;        // default 104857600 (100MB)
```

`zod` schema di `packages/utils/config.ts` validate. Kalau `PROVIDER_PRIMARY === PROVIDER_FALLBACK` → fail-fast error di startup.

## 14. Logging & observability

Setiap call hub:
```
{ component: 'providers', service, op, role, provider, latency_ms, status, traceId }
```

Failure:
```
{ ..., kind, attempts: [{ provider, kind, status }] }
```

Circuit transition:
```
{ component: 'providers.circuit', provider, transition: 'closed→open' | 'open→half-open' | 'half-open→closed', consecutiveFails }
```

Bot logger udah PII-mask aware — provider HTTP URL kemungkinan ada `username` query param. Mask di terminal log (truncate username), JSON file tetep raw.

## 15. UX Catatan

- **Reaction feedback**: handler kasih `ctx.react?.('⏳')` saat mulai (kalau capability ada), `✅` saat sukses, `❌` saat gagal. Optional, gak break kalau platform gak support.
- **Quote reply**: `ctx.reply(text, { quote: true })` — biar user tau response link mana.
- **Inline button**: Telegram tambah button `[🔄 Try Again]` yang re-dispatch command. WA ignore (capability false).
- **Caption truncate**: WA limit caption ~1024 char, Telegram ~1024 char. Truncate di builder.

## 16. Acceptance criteria

- ✅ `npm run build` hijau di seluruh workspace.
- ✅ `npm test` hijau termasuk test baru di `@bot/providers` (mock undici), `@bot/features` (mock hub).
- ✅ `/tiktok <url>` di WA & Telegram → balikin video buffer dengan caption + `source: primary`.
- ✅ Force siputzx fail (mock 503) → otomatis fallback covenant → caption `source: fallback`.
- ✅ Force dua-duanya fail → reply `⚠️ Service lagi gak available...`.
- ✅ `/tiktok` tanpa arg → reply usage + example dari `requireArgs` middleware.
- ✅ `/tiktok invalidlink` → reply `❌ Link bukan TikTok yang valid.` (validation short-circuit, gak nyentuh provider).
- ✅ `/igstalk <user>` balikin profile text dengan field followers/following/bio.
- ✅ `/ffstalk <uid>` (covenant-only) jalan kalau apikey ada; reply config-error kalau apikey kosong.
- ✅ Circuit breaker test: 5 consecutive 5xx → next call skip provider tanpa hit network.
- ✅ Download size > 100MB → reply error + suggest direct link, gak buffer ke memory full.
- ✅ `/help` & `/menu` show kategori `Downloader` & `Stalker` dengan command list.
- ✅ Fitur existing (`/ping`, `/remind`, `/kick`, dll) zero-regression.
- ✅ Linter & typecheck clean.

## 17. Out of scope (future)

- Caching response stalker (LRU dengan TTL pendek 5 menit) — fase 2.
- Universal `/dl <url>` auto-detect domain.
- Health-based routing (track success rate per service).
- Distributed circuit state (Redis).
- AI/Search/Anime/Tools/Primbon kategori dari provider.
- Streaming upload ke Telegram (buat file > 50MB Telegram butuh streaming).
- Metrics/prom exporter.
- Provider ke-3.

## 18. Risiko & mitigasi

| Risk | Mitigasi |
| ---- | -------- |
| Provider response shape berubah | Zod schema validate, parse error → `kind='parse'` → fallback otomatis. Normalizer per-service jadi single point of fix. |
| Provider down sustained | Circuit breaker buka, request gak nyentuh network. User dapet error cepet. |
| Quota covenant habis | 401/403 = validation, gak fallback (gak nolong). Owner monitor lewat log. |
| File CDN expired link | `fetchBuffer` 404 → `kind='http'` → fallback (siapa tau yang lain valid). |
| Download memory pressure | Hard cap 100MB enforced sebelum buffer concat. Tetep blocking-ish di event loop, akeptabel buat single-user bot. |
| Bot di-spam download | Rate limit per chat (existing `rateLimit.outbound`) + Bottleneck per provider. Bisa tambah cooldown middleware per-command nanti. |
