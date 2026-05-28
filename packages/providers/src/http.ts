import Bottleneck from 'bottleneck';
import { request } from 'undici';
import { ProviderError, type ProviderErrorKind } from './errors.js';
import type { ProviderName } from './types.js';

export interface HttpClientConfig {
  timeoutMs: number;
  minTimeMs: number;
  maxConcurrent: number;
  /**
   * Hard cap for JSON response bodies (`get`). Defaults to 4 MiB. Prevents a
   * compromised provider from exhausting memory via unbounded payloads.
   */
  responseMaxBytes?: number;
}

export interface HttpGetOpts {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Override the default response body size cap for this call. */
  maxBytes?: number;
}

export interface HttpFetchBufferOpts {
  maxBytes: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * Provider name to tag any ProviderError raised by this fetch. Defaults
   * to 'unknown' when not provided so postmortem traces still attribute the
   * failure to a real source instead of a sentinel '-'.
   */
  provider?: ProviderName | 'unknown';
}

const DEFAULT_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;

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

async function readBoundedJson<T>(
  provider: string,
  url: string,
  body: AsyncIterable<Buffer>,
  maxBytes: number,
): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new ProviderError(provider, url, 'validation', { detail: 'response_too_large' });
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new ProviderError(provider, url, 'parse', { cause });
  }
}

export class HttpClient {
  private readonly limiters = new Map<string, Bottleneck>();
  private readonly responseMaxBytes: number;

  constructor(private readonly config: HttpClientConfig) {
    this.responseMaxBytes = config.responseMaxBytes ?? DEFAULT_RESPONSE_MAX_BYTES;
  }

  async get<T = unknown>(provider: ProviderName, url: string, opts: HttpGetOpts = {}): Promise<T> {
    const limiter = this.limiter(provider);
    return limiter.schedule(async () => {
      const fullUrl = buildUrl(url, opts.query);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.timeoutMs);
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
        const cap = opts.maxBytes ?? this.responseMaxBytes;
        return await readBoundedJson<T>(provider, url, response.body as AsyncIterable<Buffer>, cap);
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
    const provider = opts.provider ?? 'unknown';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.config.timeoutMs);
    try {
      const response = await request(url, {
        method: 'GET',
        headers: opts.headers ?? {},
        signal: controller.signal,
      });
      if (response.statusCode >= 400) {
        throw new ProviderError(provider, url, statusToKind(response.statusCode), {
          status: response.statusCode,
        });
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response.body as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > opts.maxBytes) {
          throw new ProviderError(provider, url, 'validation', { detail: 'file_too_large' });
        }
        chunks.push(chunk);
      }
      const mimeType =
        (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      return { buffer: Buffer.concat(chunks), mimeType };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as { name?: string }).name === 'AbortError') {
        throw new ProviderError(provider, url, 'timeout', { cause: error });
      }
      throw new ProviderError(provider, url, 'http', { cause: error });
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
