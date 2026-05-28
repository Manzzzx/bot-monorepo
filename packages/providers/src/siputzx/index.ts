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
import { SIPUTZX_BASE, SIPUTZX_DOWNLOADER, SIPUTZX_STALKER } from './endpoints.js';
import { normalizeDownloader } from './normalizers/downloader.js';
import { normalizeStalker } from './normalizers/stalker.js';

export interface SiputzxOptions {
  http: HttpClient;
  logger?: Logger;
}

const DOWNLOADER_CAPS: ProviderCapabilities['downloader'] = {
  tiktok: true,
  igdl: true,
  fbdl: true,
  twitter: true,
  ytmp3: true,
  ytmp4: true,
  spotify: true,
};

const STALKER_CAPS: ProviderCapabilities['stalker'] = {
  instagram: true,
  tiktok: true,
  github: true,
  twitter: true,
  threads: true,
  pinterest: true,
  youtube: true,
  roblox: true,
};

export class SiputzxProvider implements ApiProvider {
  readonly name: ProviderName = 'siputzx';
  readonly capabilities: ProviderCapabilities = {
    downloader: DOWNLOADER_CAPS,
    stalker: STALKER_CAPS,
  };

  constructor(private readonly options: SiputzxOptions) {}

  async download(service: DownloaderService, query: DownloadQuery): Promise<DownloaderResult> {
    const path = SIPUTZX_DOWNLOADER[service as keyof typeof SIPUTZX_DOWNLOADER];
    if (!path) {
      throw new ProviderError(this.name, `download/${service}`, 'unsupported');
    }
    const url = `${SIPUTZX_BASE}${path}`;
    const queryParams: Record<string, string> = { url: query.url };
    if (service === 'ytmp3') queryParams.format = 'mp3';
    if (service === 'ytmp4') queryParams.format = 'mp4';
    const payload = await this.options.http.get(this.name, url, { query: queryParams });
    return normalizeDownloader(service, payload);
  }

  async stalk(service: StalkerService, query: StalkQuery): Promise<StalkerResult> {
    const path = SIPUTZX_STALKER[service as keyof typeof SIPUTZX_STALKER];
    if (!path) {
      throw new ProviderError(this.name, `stalk/${service}`, 'unsupported');
    }
    const url = `${SIPUTZX_BASE}${path}`;
    const queryParams: Record<string, string> = { username: query.username };
    if (query.extra) {
      for (const [key, value] of Object.entries(query.extra)) queryParams[key] = value;
    }
    const payload = await this.options.http.get(this.name, url, { query: queryParams });
    return normalizeStalker(service, payload);
  }
}
