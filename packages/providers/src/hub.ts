import type { Logger } from 'pino';
import type { CircuitBreaker } from './circuit.js';
import { ProviderError, ProviderUnavailableError, shouldCountAsFailure } from './errors.js';
import type { HttpClient } from './http.js';
import type {
  ApiProvider,
  DownloaderResult,
  DownloaderService,
  DownloadQuery,
  ProviderName,
  ProviderRole,
  StalkerResult,
  StalkerService,
  StalkQuery,
  TaggedResult,
} from './types.js';

export interface ProviderHubConfig {
  providers: Record<ProviderName, ApiProvider | null>;
  priority: { primary: ProviderName; fallback: ProviderName };
  breaker: CircuitBreaker;
  http: HttpClient;
  downloadMaxBytes: number;
  logger?: Logger;
}

type Op = 'download' | 'stalk';

export class ProviderHub {
  constructor(private readonly config: ProviderHubConfig) {}

  download(
    service: DownloaderService,
    query: DownloadQuery,
  ): Promise<TaggedResult<DownloaderResult>> {
    return this.dispatch<DownloaderResult>(
      'download',
      service,
      query,
      (provider) => Boolean(provider.capabilities.downloader[service]),
    );
  }

  stalk(
    service: StalkerService,
    query: StalkQuery,
  ): Promise<TaggedResult<StalkerResult>> {
    return this.dispatch<StalkerResult>(
      'stalk',
      service,
      query,
      (provider) => Boolean(provider.capabilities.stalker[service]),
    );
  }

  async fetchMedia(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    return this.config.http.fetchBuffer(url, { maxBytes: this.config.downloadMaxBytes });
  }

  private async dispatch<T>(
    op: Op,
    service: string,
    query: DownloadQuery | StalkQuery,
    capability: (provider: ApiProvider) => boolean,
  ): Promise<TaggedResult<T>> {
    const attempts: ProviderError[] = [];
    const roles: ProviderRole[] = ['primary', 'fallback'];

    for (const role of roles) {
      const providerName = this.config.priority[role];
      const provider = this.config.providers[providerName];
      if (!provider) continue;
      if (!capability(provider)) continue;
      if (this.config.breaker.isOpen(providerName)) {
        attempts.push(new ProviderError(providerName, `${op}/${service}`, 'circuit_open'));
        continue;
      }
      try {
        const result =
          op === 'download'
            ? await provider.download(service as DownloaderService, query as DownloadQuery)
            : await provider.stalk(service as StalkerService, query as StalkQuery);
        this.config.breaker.recordSuccess(providerName);
        this.config.logger?.info(
          {
            component: 'providers',
            op,
            service,
            role,
            provider: providerName,
            status: 'ok',
          },
          'provider call ok',
        );
        return { ...(result as object), source: role } as TaggedResult<T>;
      } catch (error) {
        if (error instanceof ProviderError) {
          if (error.kind === 'validation' || error.kind === 'unauthorized') throw error;
        }
        if (shouldCountAsFailure(error)) this.config.breaker.recordFailure(providerName);
        const wrapped =
          error instanceof ProviderError
            ? error
            : new ProviderError(providerName, `${op}/${service}`, 'http', { cause: error });
        attempts.push(wrapped);
        this.config.logger?.warn(
          {
            component: 'providers',
            op,
            service,
            role,
            provider: providerName,
            status: 'fail',
            kind: wrapped.kind,
            errStatus: wrapped.status,
          },
          'provider call fail',
        );
      }
    }

    throw new ProviderUnavailableError(service, attempts);
  }
}