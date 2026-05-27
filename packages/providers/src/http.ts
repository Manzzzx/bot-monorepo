import Bottleneck from 'bottleneck';
import { request } from 'undici';
import { ProviderError, type ProviderErrorKind } from './errors.js';
import type { ProviderName } from './types.js';

export interface HttpClientConfig {
  timeoutMs: number;
  minTimeMs: number;
  maxConcurrent: number;
}

export interface HttpGetOpts {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpFetchBufferOpts {
  maxBytes: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function statusToKind(status: number): ProviderErrorKind {
  if (status === 400) return 'validation';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limit';
  return 'http';
}

function buildUrl(url: string, query?: Record<string, string>): string {
  if (!query) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

export class HttpClient {
  private readonly limiters = new Map<string, Bottleneck>();

  constructor(private readonly config: HttpClientConfig) {}

  async get<T = unknown>(provider: ProviderName, url: string, opts: HttpGetOpts = {}): Promise<T> {
    const limiter = this.limiter(provider);
    return limiter.schedule(async () => {
      const fullUrl = buildUrl(url, opts.query);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        opts.timeoutMs ?? this.config.timeoutMs,
      );
      try {
        const response = await request(fullUrl, {
          method: 'GET',
          headers: opts.headers ?? {},
          signal: controller.signal,
        });
        if (response.statusCode >= 400) {
          throw new ProviderError(provider, url, statusToKind(response.statusCode), {
            status: response.statusCode,
          });
        }
        try {
          return (await response.body.json()) as T;
        } catch (cause) {
          throw new ProviderError(provider, url, 'parse', { cause });
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as { name?: string }).name === 'AbortError') {
          throw new ProviderError(provider, url, 'timeout', { cause: error });
        }
        throw new ProviderError(provider, url, 'http', { cause: error });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async fetchBuffer(
    url: string,
    opts: HttpFetchBufferOpts,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? this.config.timeoutMs,
    );
    try {
      const response = await request(url, {
        method: 'GET',
        headers: opts.headers ?? {},
        signal: controller.signal,
      });
      if (response.statusCode >= 400) {
        throw new ProviderError('-', url, statusToKind(response.statusCode), {
          status: response.statusCode,
        });
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response.body as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > opts.maxBytes) {
          throw new ProviderError('-', url, 'validation', { detail: 'file_too_large' });
        }
        chunks.push(chunk);
      }
      const mimeType =
        (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      return { buffer: Buffer.concat(chunks), mimeType };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as { name?: string }).name === 'AbortError') {
        throw new ProviderError('-', url, 'timeout', { cause: error });
      }
      throw new ProviderError('-', url, 'http', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  private limiter(provider: string): Bottleneck {
    let limiter = this.limiters.get(provider);
    if (!limiter) {
      limiter = new Bottleneck({
        minTime: this.config.minTimeMs,
        maxConcurrent: this.config.maxConcurrent,
      });
      this.limiters.set(provider, limiter);
    }
    return limiter;
  }
}