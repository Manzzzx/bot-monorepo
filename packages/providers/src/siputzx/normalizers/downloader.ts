import { ProviderError } from '../../errors.js';
import { DownloaderResultSchema } from '../../schemas.js';
import type { DownloaderResult, DownloaderService } from '../../types.js';

interface SiputzxEnvelope<T> {
  status: boolean;
  data?: T;
  code?: number;
  error?: string;
}

function ensureSuccess<T>(payload: unknown, endpoint: string): T {
  const envelope = payload as SiputzxEnvelope<T>;
  if (!envelope || typeof envelope !== 'object') {
    throw new ProviderError('siputzx', endpoint, 'parse', { detail: 'unexpected envelope' });
  }
  if (envelope.status === false || envelope.data === undefined) {
    const status = envelope.code ?? 0;
    throw new ProviderError('siputzx', endpoint, 'http', {
      ...(status ? { status } : {}),
      ...(envelope.error ? { detail: envelope.error } : {}),
    });
  }
  return envelope.data as T;
}

interface TiktokData {
  type?: string;
  title?: string;
  thumbnail?: string;
  author?: string;
  media?: Array<{ url?: string; type?: string; quality?: string }>;
}

function normalizeTiktok(payload: unknown): DownloaderResult {
  const data = ensureSuccess<TiktokData>(payload, '/api/d/tiktok');
  const items = Array.isArray(data.media) ? data.media : [];
  const hd = items.find((item) => item?.type === 'video_hd' && typeof item.url === 'string');
  const sd = items.find((item) => item?.type === 'video' && typeof item.url === 'string');
  const pick = hd ?? sd ?? items[0];
  if (!pick?.url) {
    throw new ProviderError('siputzx', '/api/d/tiktok', 'parse', { detail: 'no media url' });
  }
  return DownloaderResultSchema.parse({
    type: 'video',
    url: pick.url,
    ...(data.title ? { title: data.title } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
  });
}

interface IgItem {
  type?: string;
  quality?: string;
  url?: string;
  size?: number;
}

function normalizeIgdl(payload: unknown): DownloaderResult {
  const data = ensureSuccess<{ result?: unknown[] }>(payload, '/api/d/sssinstagram');
  const items = (data.result ?? []) as Array<IgItem | Record<string, unknown>>;
  const media = items.filter(
    (entry): entry is IgItem =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as IgItem).url === 'string' &&
      ((entry as IgItem).type === 'video' || (entry as IgItem).type === 'image'),
  );
  if (media.length === 0) {
    throw new ProviderError('siputzx', '/api/d/sssinstagram', 'parse', { detail: 'no media' });
  }
  const video = media.find((item) => item.type === 'video');
  const pick = video ?? media[0];
  if (!pick?.url) {
    throw new ProviderError('siputzx', '/api/d/sssinstagram', 'parse', { detail: 'no media url' });
  }
  return DownloaderResultSchema.parse({
    type: pick.type === 'image' ? 'image' : 'video',
    url: pick.url,
    ...(typeof pick.size === 'number' ? { sizeBytes: pick.size } : {}),
  });
}

interface FbDownload {
  quality?: string;
  type?: string;
  url?: string;
}

function normalizeFbdl(payload: unknown): DownloaderResult {
  const data = ensureSuccess<{
    title?: string;
    thumbnail?: string;
    duration?: string;
    downloads?: FbDownload[];
  }>(payload, '/api/d/facebook');
  const items = data.downloads ?? [];
  const hd = items.find((item) => item?.quality?.toLowerCase().includes('hd') && item.url);
  const pick = hd ?? items.find((item) => item.url);
  if (!pick?.url) {
    throw new ProviderError('siputzx', '/api/d/facebook', 'parse', { detail: 'no media url' });
  }
  return DownloaderResultSchema.parse({
    type: 'video',
    url: pick.url,
    ...(data.title ? { title: data.title } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
  });
}

function normalizeTwitter(payload: unknown): DownloaderResult {
  const data = ensureSuccess<{
    downloadLink?: string;
    imgUrl?: string;
    videoTitle?: string;
    videoDescription?: string;
  }>(payload, '/api/d/twitter');
  if (!data.downloadLink) {
    throw new ProviderError('siputzx', '/api/d/twitter', 'parse', { detail: 'no download link' });
  }
  return DownloaderResultSchema.parse({
    type: 'video',
    url: data.downloadLink,
    ...(data.videoTitle ? { title: data.videoTitle } : {}),
    ...(data.videoDescription ? { caption: data.videoDescription } : {}),
    ...(data.imgUrl ? { thumbnailUrl: data.imgUrl } : {}),
  });
}

interface SavefromEntry {
  type?: string;
  data?: {
    url?: Array<{ url?: string; ext?: string }>;
    meta?: { title?: string; duration?: string };
  };
}

function pickSavefrom(items: SavefromEntry[], type: 'audio' | 'video'): SavefromEntry | undefined {
  return items.find((entry) => entry?.type === type && entry.data?.url?.[0]?.url);
}

function normalizeYtmp3(payload: unknown): DownloaderResult {
  const items = ensureSuccess<SavefromEntry[]>(payload, '/api/d/savefrom');
  const list = Array.isArray(items) ? items : [];
  const pick = pickSavefrom(list, 'audio') ?? pickSavefrom(list, 'video');
  const url = pick?.data?.url?.[0]?.url;
  if (!url) {
    throw new ProviderError('siputzx', '/api/d/savefrom', 'parse', { detail: 'no audio url' });
  }
  return DownloaderResultSchema.parse({
    type: 'audio',
    url,
    ...(pick?.data?.meta?.title ? { title: pick.data.meta.title } : {}),
  });
}

function normalizeYtmp4(payload: unknown): DownloaderResult {
  const items = ensureSuccess<SavefromEntry[]>(payload, '/api/d/savefrom');
  const list = Array.isArray(items) ? items : [];
  const pick = pickSavefrom(list, 'video') ?? pickSavefrom(list, 'audio');
  const url = pick?.data?.url?.[0]?.url;
  if (!url) {
    throw new ProviderError('siputzx', '/api/d/savefrom', 'parse', { detail: 'no video url' });
  }
  return DownloaderResultSchema.parse({
    type: pick?.type === 'audio' ? 'audio' : 'video',
    url,
    ...(pick?.data?.meta?.title ? { title: pick.data.meta.title } : {}),
  });
}

interface SpotifyData {
  download?: string;
  url?: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
}

function normalizeSpotify(payload: unknown): DownloaderResult {
  const data = ensureSuccess<SpotifyData>(payload, '/api/d/spotifyv2');
  const url = data.download ?? data.url;
  if (!url) {
    throw new ProviderError('siputzx', '/api/d/spotifyv2', 'parse', { detail: 'no media url' });
  }
  return DownloaderResultSchema.parse({
    type: 'audio',
    url,
    ...(data.title ? { title: data.title } : {}),
    ...(data.artist ? { author: data.artist } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
    ...(typeof data.duration === 'number' ? { durationSec: data.duration } : {}),
  });
}

const NORMALIZERS: Partial<Record<DownloaderService, (payload: unknown) => DownloaderResult>> = {
  tiktok: normalizeTiktok,
  igdl: normalizeIgdl,
  fbdl: normalizeFbdl,
  twitter: normalizeTwitter,
  ytmp3: normalizeYtmp3,
  ytmp4: normalizeYtmp4,
  spotify: normalizeSpotify,
};

export function normalizeDownloader(
  service: DownloaderService,
  payload: unknown,
): DownloaderResult {
  const normalizer = NORMALIZERS[service];
  if (!normalizer) {
    throw new ProviderError('siputzx', `download/${service}`, 'unsupported');
  }
  return normalizer(payload);
}