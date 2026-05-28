import { ProviderError } from '../../errors.js';
import { DownloaderResultSchema } from '../../schemas.js';
import type { DownloaderResult, DownloaderService } from '../../types.js';

interface CovenantEnvelope<T> {
  status: boolean;
  code?: number;
  message?: string;
  error?: { type?: string; detail?: string } | string;
  data?: T;
}

function detailFromError(err: CovenantEnvelope<unknown>['error']): string | undefined {
  if (!err) return undefined;
  if (typeof err === 'string') return err;
  return err.detail ?? err.type;
}

function ensureSuccess<T>(payload: unknown, endpoint: string): T {
  const envelope = payload as CovenantEnvelope<T>;
  if (!envelope || typeof envelope !== 'object') {
    throw new ProviderError('covenant', endpoint, 'parse', { detail: 'unexpected envelope' });
  }
  if (envelope.status === false || envelope.data === undefined) {
    const status = envelope.code ?? 0;
    const detail = envelope.message ?? detailFromError(envelope.error);
    throw new ProviderError('covenant', endpoint, status === 400 ? 'validation' : 'http', {
      ...(status ? { status } : {}),
      ...(detail ? { detail } : {}),
    });
  }
  return envelope.data as T;
}

interface MediaItem {
  type?: string;
  url?: string;
  hd?: string;
  sd?: string;
  quality?: string;
  format?: string;
  size?: number;
}

function pickMedia(
  items: MediaItem[],
  preference: 'video' | 'audio' | 'image',
): MediaItem | undefined {
  const exact = items.find((item) => item.type === preference && (item.url ?? item.hd ?? item.sd));
  if (exact) return exact;
  return items.find((item) => Boolean(item.url ?? item.hd ?? item.sd));
}

function urlOf(item: MediaItem): string | undefined {
  return item.hd ?? item.url ?? item.sd;
}

interface MediaPayload {
  title?: string;
  description?: string;
  thumbnail?: string;
  duration_seconds?: number;
  author?: { name?: string } | string | null;
  media?: MediaItem[];
}

function authorName(payload: MediaPayload): string | undefined {
  if (typeof payload.author === 'string') return payload.author;
  if (payload.author && typeof payload.author === 'object' && payload.author.name) {
    return payload.author.name;
  }
  return undefined;
}

function normalizeMediaResponse(
  payload: unknown,
  endpoint: string,
  prefer: 'video' | 'audio' | 'image',
): DownloaderResult {
  const data = ensureSuccess<MediaPayload>(payload, endpoint);
  const items = Array.isArray(data.media) ? data.media : [];
  const pick = pickMedia(items, prefer);
  const url = pick ? urlOf(pick) : undefined;
  if (!url) {
    throw new ProviderError('covenant', endpoint, 'parse', { detail: 'no media url' });
  }
  const type = pick?.type === 'audio' ? 'audio' : pick?.type === 'image' ? 'image' : prefer;
  const author = authorName(data);
  return DownloaderResultSchema.parse({
    type,
    url,
    ...(data.title ? { title: data.title } : {}),
    ...(author ? { author } : {}),
    ...(data.description ? { caption: data.description } : {}),
    ...(typeof data.duration_seconds === 'number' ? { durationSec: data.duration_seconds } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
    ...(typeof pick?.size === 'number' ? { sizeBytes: pick.size } : {}),
  });
}

interface AioData {
  response?: number;
  response_type?: string;
  success?: boolean;
  message?: string;
  url?: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  media?: MediaItem[];
}

function normalizeAio(payload: unknown): DownloaderResult {
  const data = ensureSuccess<AioData>(payload, '/api/downloader/aio');
  if (data.success === false) {
    throw new ProviderError('covenant', '/api/downloader/aio', 'http', {
      detail: data.message ?? 'aio failed',
    });
  }
  const items = Array.isArray(data.media) ? data.media : [];
  const pick = pickMedia(items, 'audio') ?? pickMedia(items, 'video');
  const url = pick ? urlOf(pick) : data.url;
  if (!url) {
    throw new ProviderError('covenant', '/api/downloader/aio', 'parse', { detail: 'no media url' });
  }
  const type = pick?.type === 'video' ? 'video' : 'audio';
  return DownloaderResultSchema.parse({
    type,
    url,
    ...(data.title ? { title: data.title } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
  });
}

interface YtData {
  title?: string;
  thumbnail?: string;
  duration?: number;
  author?: { name?: string } | string;
  media?: MediaItem[];
}

function normalizeYt(payload: unknown, prefer: 'audio' | 'video'): DownloaderResult {
  const data = ensureSuccess<YtData>(payload, '/api/downloader/yt');
  const items = Array.isArray(data.media) ? data.media : [];
  const pick = pickMedia(items, prefer) ?? pickMedia(items, prefer === 'audio' ? 'video' : 'audio');
  const url = pick ? urlOf(pick) : undefined;
  if (!url) {
    throw new ProviderError('covenant', '/api/downloader/yt', 'parse', { detail: 'no media url' });
  }
  const author =
    typeof data.author === 'string'
      ? data.author
      : typeof data.author === 'object'
        ? data.author.name
        : undefined;
  const type = pick?.type === 'audio' ? 'audio' : pick?.type === 'video' ? 'video' : prefer;
  return DownloaderResultSchema.parse({
    type,
    url,
    ...(data.title ? { title: data.title } : {}),
    ...(author ? { author } : {}),
    ...(data.thumbnail ? { thumbnailUrl: data.thumbnail } : {}),
    ...(typeof data.duration === 'number' ? { durationSec: data.duration } : {}),
    ...(typeof pick?.size === 'number' ? { sizeBytes: pick.size } : {}),
  });
}

interface SfileData {
  filename?: string;
  size?: number;
  download_url?: string;
  url?: string;
}

function normalizeSfile(payload: unknown): DownloaderResult {
  const data = ensureSuccess<SfileData>(payload, '/api/downloader/sfile');
  const url = data.download_url ?? data.url;
  if (!url) {
    throw new ProviderError('covenant', '/api/downloader/sfile', 'parse', {
      detail: 'no media url',
    });
  }
  return DownloaderResultSchema.parse({
    type: 'document',
    url,
    ...(data.filename ? { title: data.filename } : {}),
    ...(typeof data.size === 'number' ? { sizeBytes: data.size } : {}),
  });
}

const NORMALIZERS: Partial<Record<DownloaderService, (payload: unknown) => DownloaderResult>> = {
  tiktok: (payload) => normalizeMediaResponse(payload, '/api/downloader/tiktok', 'video'),
  igdl: (payload) => normalizeMediaResponse(payload, '/api/downloader/instagram', 'video'),
  fbdl: (payload) => normalizeMediaResponse(payload, '/api/downloader/facebook', 'video'),
  twitter: (payload) => normalizeMediaResponse(payload, '/api/downloader/twitter', 'video'),
  ytmp3: (payload) => normalizeYt(payload, 'audio'),
  ytmp4: (payload) => normalizeYt(payload, 'video'),
  spotify: normalizeAio,
  pinterest: (payload) => normalizeMediaResponse(payload, '/api/downloader/pinterest', 'image'),
  sfile: normalizeSfile,
};

export function normalizeDownloader(
  service: DownloaderService,
  payload: unknown,
): DownloaderResult {
  const normalizer = NORMALIZERS[service];
  if (!normalizer) {
    throw new ProviderError('covenant', `download/${service}`, 'unsupported');
  }
  return normalizer(payload);
}
