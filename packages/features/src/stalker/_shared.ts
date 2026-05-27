import type {
  AppStalkerResult,
  Command,
  Feature,
  MessageCtx,
} from '@bot/contracts';
import { reply } from '@bot/contracts';
import { requireArgs } from '@bot/core';
import { appFromCtx } from '../general/_registry.js';

type StalkerService =
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

export interface StalkerFeatureSpec {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  examples?: string[];
  service: StalkerService;
  argsMin: number;
  buildQuery(args: string[]): { username: string; extra?: Record<string, string> } | null;
  invalidArgsMessage: string;
  header: string;
}

interface ProviderUnavailableLike {
  name?: string;
}

interface ProviderErrorLike {
  name?: string;
  kind?: string;
  detail?: string;
  status?: number;
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
    /* swallow */
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('id-ID');
}

function fieldLabel(key: string): string {
  if (key === 'level') return 'Level';
  if (key === 'region') return 'Region';
  if (key === 'rank') return 'Rank';
  if (key === 'exp') return 'EXP';
  if (key === 'zoneId') return 'Zone ID';
  if (key === 'subscribers') return 'Subscribers';
  if (key === 'videos') return 'Videos';
  if (key === 'illusts') return 'Ilustrasi';
  if (key === 'manga') return 'Manga';
  if (key === 'novels') return 'Novel';
  if (key === 'webpage') return 'Website';
  if (key === 'premium') return 'Premium';
  if (key === 'likes') return 'Likes';
  if (key === 'heartCount') return 'Hearts';
  if (key === 'boards') return 'Boards';
  if (key === 'company') return 'Company';
  if (key === 'location') return 'Location';
  if (key === 'createdAt') return 'Bergabung';
  if (key === 'publicRepos') return 'Public Repos';
  return key;
}

function formatExtra(extra: Record<string, unknown> | undefined): string[] {
  if (!extra) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number') lines.push(`• ${fieldLabel(key)}: ${formatNumber(value)}`);
    else if (typeof value === 'boolean') lines.push(`• ${fieldLabel(key)}: ${value ? 'ya' : 'tidak'}`);
    else lines.push(`• ${fieldLabel(key)}: ${truncate(String(value), 200)}`);
  }
  return lines;
}

export function buildStalkerCaption(
  result: AppStalkerResult,
  header: string,
): string {
  const lines = [header];
  const verifiedBadge = result.verified ? ' ✅' : '';
  const privateBadge = result.private ? ' 🔒' : '';
  const display = result.displayName ? `${result.displayName}${verifiedBadge}${privateBadge}` : '';
  if (display) lines.push(`👤 ${display}`);
  lines.push(`🆔 @${result.username}`);
  if (result.bio) {
    lines.push('');
    lines.push(truncate(result.bio, 300));
    lines.push('');
  } else {
    lines.push('');
  }
  if (typeof result.followers === 'number') lines.push(`👥 Followers: ${formatNumber(result.followers)}`);
  if (typeof result.following === 'number') lines.push(`➡️ Following: ${formatNumber(result.following)}`);
  if (typeof result.posts === 'number') lines.push(`📦 Posts: ${formatNumber(result.posts)}`);
  const extraLines = formatExtra(result.extra);
  if (extraLines.length) {
    lines.push('');
    lines.push(...extraLines);
  }
  if (result.url) {
    lines.push('');
    lines.push(`🔗 ${result.url}`);
  }
  lines.push('');
  lines.push(`source: ${result.source}`);
  return lines.join('\n');
}

async function replyError(ctx: MessageCtx, message: string): Promise<void> {
  await reactSafe(ctx, '❌');
  await reply(ctx, message, { quote: true });
}

async function handleError(
  ctx: MessageCtx,
  spec: StalkerFeatureSpec,
  error: unknown,
): Promise<void> {
  if (isProviderError(error)) {
    if (error.kind === 'validation') {
      await replyError(ctx, `❌ Input gak valid untuk ${spec.name}. Cek format dan coba lagi.`);
      return;
    }
    if (error.kind === 'unauthorized') {
      ctx.logger.error(
        { component: 'stalker', service: spec.service, kind: error.kind },
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
      component: 'stalker',
      service: spec.service,
      err: error instanceof Error ? { name: error.name, message: error.message } : error,
    },
    'unexpected stalker error',
  );
  await replyError(ctx, '⚠️ Terjadi kesalahan tak terduga, coba lagi nanti.');
}

export async function runStalker(ctx: MessageCtx, spec: StalkerFeatureSpec): Promise<void> {
  const queryInput = spec.buildQuery(ctx.args);
  if (!queryInput) {
    await reply(ctx, spec.invalidArgsMessage, { quote: true });
    return;
  }
  const app = appFromCtx(ctx);
  await reactSafe(ctx, '⏳');
  try {
    const result = await app.providers.stalk(spec.service, queryInput);
    await reply(ctx, buildStalkerCaption(result, spec.header), { quote: true });
    await reactSafe(ctx, '✅');
  } catch (error) {
    await handleError(ctx, spec, error);
  }
}

export function createStalkerFeature(spec: StalkerFeatureSpec): Feature {
  const command: Command = {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    guards: [requireArgs(spec.argsMin)],
    async handler(ctx) {
      await runStalker(ctx, spec);
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

export function singleArgQuery(args: string[]): { username: string } | null {
  const value = args[0]?.trim();
  if (!value) return null;
  return { username: value };
}