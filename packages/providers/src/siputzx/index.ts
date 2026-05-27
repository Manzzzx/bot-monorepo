import type { Logger } from 'pino';
import type { HttpClient } from '../http.js';
import { ProviderError } from '../errors.js';
import type {
  ApiProvider,
  DownloaderResult,
  DownloaderService,
  DownloadQuery,
  ProviderCapabilities,
  ProviderName,
  StalkerResult,
  StalkerService,
  StalkQuery,
} from '../types.js';

export interface SiputzxOptions {
  http: HttpClient;
  logger?: Logger;
}

export class SiputzxProvider implements ApiProvider {
  readonly name: ProviderName = 'siputzx';
  readonly capabilities: ProviderCapabilities = {
    downloader: {},
    stalker: {},
  };

  constructor(_options: SiputzxOptions) {
    void _options;
  }

  async download(service: DownloaderService, _query: DownloadQuery): Promise<DownloaderResult> {
    void _query;
    throw new ProviderError(this.name, `download/${service}`, 'unsupported', {
      detail: 'not_implemented',
    });
  }

  async stalk(service: StalkerService, _query: StalkQuery): Promise<StalkerResult> {
    void _query;
    throw new ProviderError(this.name, `stalk/${service}`, 'unsupported', {
      detail: 'not_implemented',
    });
  }
}