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
import {
  COVENANT_BASE,
  COVENANT_DOWNLOADER,
  COVENANT_STALKER,
  COVENANT_STALKER_PARAM,
} from './endpoints.js';
import { normalizeDownloader } from './normalizers/downloader.js';
import { normalizeStalker } from './normalizers/stalker.js';

export interface CovenantOptions {
  http: HttpClient;
  apiKey: string;
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
  pinterest: true,
  sfile: true,
};

const STALKER_CAPS: ProviderCapabilities['stalker'] = {
  instagram: true,
  tiktok: true,
  twitter: true,
  threads: true,
  pinterest: true,
  facebook: true,
  freefire: true,
  mlbb: true,
  pixiv: true,
  whatsapp: true,
};

export class CovenantProvider implements ApiProvider {
  readonly name: ProviderName = 'covenant';
  readonly capabilities: ProviderCapabilities = {
    downloader: DOWNLOADER_CAPS,
    stalker: STALKER_CAPS,
  };

  constructor(private readonly options: CovenantOptions) {}

  protected authHeaders(): Record<string, string> {
    return { 'x-api-key': this.options.apiKey };
  }

  async download(service: DownloaderService, query: DownloadQuery): Promise<DownloaderResult> {
    const path = COVENANT_DOWNLOADER[service as keyof typeof COVENANT_DOWNLOADER];
    if (!path) {
      throw new ProviderError(this.name, `download/${service}`, 'unsupported');
    }
    const url = `${COVENANT_BASE}${path}`;
    const queryParams: Record<string, string> = { url: query.url };
    if (service === 'tiktok') queryParams.hd = 'true';
    if (service === 'ytmp3') queryParams.format = 'mp3';
    if (service === 'ytmp4') queryParams.format = 'mp4';
    const payload = await this.options.http.get(this.name, url, {
      query: queryParams,
      headers: this.authHeaders(),
    });
    return normalizeDownloader(service, payload);
  }

  async stalk(service: StalkerService, query: StalkQuery): Promise<StalkerResult> {
    const path = COVENANT_STALKER[service as keyof typeof COVENANT_STALKER];
    if (!path) {
      throw new ProviderError(this.name, `stalk/${service}`, 'unsupported');
    }
    const url = `${COVENANT_BASE}${path}`;
    const paramKey = COVENANT_STALKER_PARAM[service] ?? 'username';
    const queryParams: Record<string, string> = { [paramKey]: query.username };
    if (query.extra) {
      for (const [key, value] of Object.entries(query.extra)) queryParams[key] = value;
    }
    const payload = await this.options.http.get(this.name, url, {
      query: queryParams,
      headers: this.authHeaders(),
    });
    return normalizeStalker(service, payload);
  }
}
