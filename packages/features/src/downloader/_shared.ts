import type { AppDownloadResult, Command, Feature, MessageCtx } from '@bot/contracts';
import { reply } from '@bot/contracts';
import { requireArgs } from '@bot/core';
import { appFromCtx } from '../general/_registry.js';

type DownloaderService =
  | 'tiktok'
  | 'igdl'
  | 'fbdl'
  | 'twitter'
  | 'ytmp3'
  | 'ytmp4'
  | 'spotify'
  | 'pinterest'
  | 'sfile';

export interface DownloaderFeatureSpec {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  examples?: string[];
  service: DownloaderService;
  domainPattern: RegExp;
  invalidDomainMessage: string;
  defaultMimeType?: string;
  fileExtension?: string;
}

interface ProviderUnavailableLike {
  name?: string;
  service?: string;
}

interface ProviderErrorLike {
  name?: string;
  kind?: string;
  detail?: string;
  status?: number;
}

function findUrl(args: string[]): string | null {
  for (const arg of args) {
    const trimmed = arg.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function defaultExtension(mimeType: string, fallback?: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('octet-stream') && fallback) return fallback;
  return fallback ?? 'bin';
}

export function buildDownloaderCaption(result: AppDownloadResult, header: string): string {
  const lines = [header];
  if (result.author) lines.push(`👤 ${result.author}`);
  if (result.title) lines.push(`📌 ${truncate(result.title, 200)}`);
  if (typeof result.durationSec === 'number') {
    lines.push(`⏱️ ${formatDuration(result.durationSec)}`);
  }
  if (result.caption) {
    lines.push('');
    lines.push(truncate(result.caption, 300));
  }
  lines.push('');
  lines.push(`source: ${result.source}`);
  return lines.join('\n');
}

function isProviderUnavailable(error: unknown): error is ProviderUnavailableLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ProviderUnavailableError'
  );
}

function isProviderError(error: unknown): error is ProviderErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ProviderError'
  );
}

async function reactSafe(ctx: MessageCtx, emoji: string): Promise<void> {
  if (!ctx.react) return;
  try {
    await ctx.react(emoji);
  } catch {
    /* swallow — reactions are best-effort */
  }
}

function headerForService(service: DownloaderService): string {
  if (service === 'tiktok') return '🎬 TikTok';
  if (service === 'igdl') return '📷 Instagram';
  if (service === 'fbdl') return '📘 Facebook';
  if (service === 'twitter') return '🐦 Twitter / X';
  if (service === 'ytmp3') return '🎵 YouTube Audio';
  if (service === 'ytmp4') return '📺 YouTube Video';
  if (service === 'spotify') return '🎧 Spotify';
  if (service === 'pinterest') return '📌 Pinterest';
  if (service === 'sfile') return '📁 Sfile';
  return '⬇️ Download';
}

async function replyError(ctx: MessageCtx, message: string): Promise<void> {
  await reactSafe(ctx, '❌');
  await reply(ctx, message, { quote: true });
}

async function handleError(
  ctx: MessageCtx,
  spec: DownloaderFeatureSpec,
  error: unknown,
): Promise<void> {
  if (isProviderError(error)) {
    if (error.kind === 'validation') {
      const detail = error.detail ?? '';
      if (detail === 'file_too_large') {
        await replyError(
          ctx,
          '⚠️ File terlalu besar untuk dikirim. Coba pakai link langsung dari hasil unduhan.',
        );
        return;
      }
      await replyError(ctx, `❌ Link tidak valid untuk ${spec.name}. Cek format dan coba lagi.`);
      return;
    }
    if (error.kind === 'unauthorized') {
      ctx.logger.error(
        { component: 'downloader', service: spec.service, kind: error.kind },
        'provider auth error',
      );
      await replyError(ctx, '⚠️ Layanan sedang bermasalah, hubungi owner.');
      return;
    }
    if (error.kind === 'rate_limit') {
      await replyError(ctx, '⏳ Lagi banyak request, tunggu sebentar ya.');
      return;
    }
  }
  if (isProviderUnavailable(error)) {
    await replyError(ctx, '⚠️ Service lagi gak available, coba lagi nanti.');
    return;
  }
  ctx.logger.error(
    {
      component: 'downloader',
      service: spec.service,
      err: error instanceof Error ? { name: error.name, message: error.message } : error,
    },
    'unexpected downloader error',
  );
  await replyError(ctx, '⚠️ Terjadi kesalahan tak terduga, coba lagi nanti.');
}

export async function runDownloader(ctx: MessageCtx, spec: DownloaderFeatureSpec): Promise<void> {
  const url = findUrl(ctx.args);
  if (!url) {
    await reply(ctx, `❌ Sertakan link URL. Cara pakai: \`${spec.usage}\``, { quote: true });
    return;
  }
  if (!spec.domainPattern.test(url)) {
    await reply(ctx, spec.invalidDomainMessage, { quote: true });
    return;
  }

  const app = appFromCtx(ctx);
  await reactSafe(ctx, '⏳');
  try {
    const result = await app.providers.download(spec.service, { url });
    const media = await app.providers.fetchMedia(result.url);
    const filename = `${spec.name}.${defaultExtension(media.mimeType, spec.fileExtension)}`;
    const caption = buildDownloaderCaption(result, headerForService(spec.service));
    await reply(ctx, caption, {
      quote: true,
      media: {
        buffer: media.buffer,
        mimeType: spec.defaultMimeType ?? media.mimeType,
        filename,
      },
    });
    await reactSafe(ctx, '✅');
  } catch (error) {
    await handleError(ctx, spec, error);
  }
}

export function createDownloaderFeature(spec: DownloaderFeatureSpec): Feature {
  const command: Command = {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    guards: [requireArgs(1)],
    async handler(ctx) {
      await runDownloader(ctx, spec);
    },
  };
  if (spec.aliases?.length) command.aliases = spec.aliases;
  if (spec.examples?.length) command.examples = spec.examples;
  return {
    name: spec.name,
    version: '1.0.0',
    commands: [command],
  };
}
