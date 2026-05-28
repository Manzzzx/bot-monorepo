import type { z } from 'zod';
import type { DownloaderResultSchema, StalkerResultSchema } from './schemas.js';

export type ProviderName = 'siputzx' | 'covenant';
export type ProviderRole = 'primary' | 'fallback';

export type DownloaderService =
  | 'tiktok'
  | 'igdl'
  | 'fbdl'
  | 'twitter'
  | 'ytmp3'
  | 'ytmp4'
  | 'spotify'
  | 'pinterest'
  | 'sfile';

export type StalkerService =
  | 'instagram'
  | 'tiktok'
  | 'github'
  | 'twitter'
  | 'threads'
  | 'pinterest'
  | 'youtube'
  | 'roblox'
  | 'facebook'
  | 'freefire'
  | 'mlbb'
  | 'pixiv'
  | 'whatsapp';

export interface ProviderCapabilities {
  downloader: Partial<Record<DownloaderService, true>>;
  stalker: Partial<Record<StalkerService, true>>;
}

export interface DownloadQuery {
  url: string;
}

export interface StalkQuery {
  username: string;
  extra?: Record<string, string>;
}

export type DownloaderResult = z.infer<typeof DownloaderResultSchema>;
export type StalkerResult = z.infer<typeof StalkerResultSchema>;

export type TaggedResult<T> = T & { source: ProviderRole };

export interface ApiProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
  download(service: DownloaderService, query: DownloadQuery): Promise<DownloaderResult>;
  stalk(service: StalkerService, query: StalkQuery): Promise<StalkerResult>;
}
