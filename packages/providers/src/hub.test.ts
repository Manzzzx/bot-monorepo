import { describe, expect, it, vi } from 'vitest';
import { ProviderHub } from './hub.js';
import { CircuitBreaker } from './circuit.js';
import { ProviderError, ProviderUnavailableError } from './errors.js';
import type { ApiProvider, DownloaderResult, ProviderCapabilities } from './types.js';

const okResult: DownloaderResult = { type: 'video', url: 'https://cdn.example.com/x.mp4' };

function provider(
  name: 'siputzx' | 'covenant',
  download?: () => Promise<DownloaderResult>,
  caps: ProviderCapabilities = { downloader: { tiktok: true }, stalker: {} },
): ApiProvider {
  return {
    name,
    capabilities: caps,
    download: vi.fn(
      download ??
        (async () => {
          throw new ProviderError(name, 'download/tiktok', 'http');
        }),
    ),
    stalk: vi.fn(),
  };
}

describe('ProviderHub.download', () => {
  it('returns primary success with source primary', async () => {
    const primary = provider('siputzx', async () => okResult);
    const fallback = provider('covenant');
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const result = await hub.download('tiktok', { url: 'https://x' });
    expect(result.source).toBe('primary');
    expect(result.url).toBe(okResult.url);
    expect(fallback.download).not.toHaveBeenCalled();
  });

  it('falls back when primary throws non-validation', async () => {
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'http', { status: 503 });
    });
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const result = await hub.download('tiktok', { url: 'https://x' });
    expect(result.source).toBe('fallback');
    expect(primary.download).toHaveBeenCalledOnce();
  });

  it('does not fall back on validation error', async () => {
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'validation', { status: 400 });
    });
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    await expect(hub.download('tiktok', { url: 'bad' })).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(fallback.download).not.toHaveBeenCalled();
  });

  it('does not fall back on unauthorized error', async () => {
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'http');
    });
    const fallback = provider('covenant', async () => {
      throw new ProviderError('covenant', 'download/tiktok', 'unauthorized', { status: 401 });
    });
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    await expect(hub.download('tiktok', { url: 'https://x' })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('throws ProviderUnavailableError when both fail', async () => {
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'http');
    });
    const fallback = provider('covenant', async () => {
      throw new ProviderError('covenant', 'download/tiktok', 'http');
    });
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 5, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const error = await hub.download('tiktok', { url: 'https://x' }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as ProviderUnavailableError).attempts).toHaveLength(2);
  });

  it('skips provider when capability false', async () => {
    const primary = provider('siputzx', async () => okResult, {
      downloader: {},
      stalker: {},
    });
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const result = await hub.download('tiktok', { url: 'https://x' });
    expect(result.source).toBe('fallback');
    expect(primary.download).not.toHaveBeenCalled();
  });

  it('skips provider when null', async () => {
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: null, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker: new CircuitBreaker({ threshold: 3, cooldownMs: 1000 }),
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const result = await hub.download('tiktok', { url: 'https://x' });
    expect(result.source).toBe('fallback');
  });

  it('skips provider when circuit open', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 60_000 });
    breaker.recordFailure('siputzx');
    const primary = provider('siputzx', async () => okResult);
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker,
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    const result = await hub.download('tiktok', { url: 'https://x' });
    expect(result.source).toBe('fallback');
    expect(primary.download).not.toHaveBeenCalled();
  });

  it('records non-validation failures to breaker', async () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 60_000 });
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'http');
    });
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker,
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    await hub.download('tiktok', { url: 'https://x' });
    await hub.download('tiktok', { url: 'https://x' });
    expect(breaker.isOpen('siputzx')).toBe(true);
  });

  it('does not record validation failures to breaker', async () => {
    const breaker = new CircuitBreaker({ threshold: 2, cooldownMs: 60_000 });
    const primary = provider('siputzx', async () => {
      throw new ProviderError('siputzx', 'download/tiktok', 'validation', { status: 400 });
    });
    const fallback = provider('covenant', async () => okResult);
    const hub = new ProviderHub({
      providers: { siputzx: primary, covenant: fallback },
      priority: { primary: 'siputzx', fallback: 'covenant' },
      breaker,
      http: { fetchBuffer: vi.fn() } as never,
      downloadMaxBytes: 1024,
    });
    await hub.download('tiktok', { url: 'bad' }).catch(() => undefined);
    await hub.download('tiktok', { url: 'bad' }).catch(() => undefined);
    expect(breaker.isOpen('siputzx')).toBe(false);
  });
});
