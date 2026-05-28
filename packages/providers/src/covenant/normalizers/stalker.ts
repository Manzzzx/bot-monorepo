import { ProviderError } from '../../errors.js';
import { StalkerResultSchema } from '../../schemas.js';
import type { StalkerResult, StalkerService } from '../../types.js';

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

interface IgData {
  username?: string;
  full_name?: string;
  biography?: string;
  profile_pic?: string;
  profile_pic_thumb?: string;
  profile_url?: string;
  flags?: { is_verified?: boolean; is_private?: boolean };
  stats?: { followers?: number; following?: number; posts?: number };
}

function normalizeInstagram(payload: unknown): StalkerResult {
  const data = ensureSuccess<IgData>(payload, '/api/stalk/instagram');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/instagram', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.full_name ? { displayName: data.full_name } : {}),
    ...(data.biography ? { bio: data.biography } : {}),
    ...((data.profile_pic ?? data.profile_pic_thumb)
      ? { avatarUrl: data.profile_pic ?? data.profile_pic_thumb }
      : {}),
    ...(typeof data.flags?.is_verified === 'boolean' ? { verified: data.flags.is_verified } : {}),
    ...(typeof data.flags?.is_private === 'boolean' ? { private: data.flags.is_private } : {}),
    ...(typeof data.stats?.followers === 'number' ? { followers: data.stats.followers } : {}),
    ...(typeof data.stats?.following === 'number' ? { following: data.stats.following } : {}),
    ...(typeof data.stats?.posts === 'number' ? { posts: data.stats.posts } : {}),
    ...(data.profile_url ? { url: data.profile_url } : {}),
  });
}

interface TtData {
  username?: string;
  nickname?: string;
  bio?: string;
  avatar?: string;
  verified?: boolean;
  private?: boolean;
  followers?: number;
  following?: number;
  videos?: number;
  likes?: number;
  url?: string;
  region?: string | null;
}

function normalizeTiktok(payload: unknown): StalkerResult {
  const data = ensureSuccess<TtData>(payload, '/api/stalk/tiktok');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/tiktok', 'parse', { detail: 'no username' });
  }
  const extra: Record<string, unknown> = {};
  if (typeof data.likes === 'number') extra.likes = data.likes;
  if (data.region) extra.region = data.region;
  return StalkerResultSchema.parse({
    username,
    ...(data.nickname ? { displayName: data.nickname } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.verified === 'boolean' ? { verified: data.verified } : {}),
    ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(typeof data.videos === 'number' ? { posts: data.videos } : {}),
    ...(data.url ? { url: data.url } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface TwData {
  username?: string;
  name?: string;
  description?: string;
  avatar?: string;
  verified?: boolean;
  private?: boolean;
  followers?: number;
  following?: number;
  tweets?: number;
  url?: string;
}

function normalizeTwitter(payload: unknown): StalkerResult {
  const data = ensureSuccess<TwData>(payload, '/api/stalk/twitter');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/twitter', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.description ? { bio: data.description } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.verified === 'boolean' ? { verified: data.verified } : {}),
    ...(typeof data.private === 'boolean' ? { private: data.private } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(typeof data.tweets === 'number' ? { posts: data.tweets } : {}),
    ...(data.url ? { url: data.url } : {}),
  });
}

interface ThData {
  username?: string;
  name?: string;
  bio?: string;
  avatar?: string;
  verified?: boolean;
  followers?: number;
  url?: string;
}

function normalizeThreads(payload: unknown): StalkerResult {
  const data = ensureSuccess<ThData>(payload, '/api/stalk/threads');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/threads', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.verified === 'boolean' ? { verified: data.verified } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(data.url ? { url: data.url } : {}),
  });
}

interface PinData {
  username?: string;
  full_name?: string;
  bio?: string;
  avatar?: string;
  followers?: number;
  following?: number;
  pins?: number;
  boards?: number;
  url?: string;
}

function normalizePinterest(payload: unknown): StalkerResult {
  const data = ensureSuccess<PinData>(payload, '/api/stalk/pinterest');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/pinterest', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.full_name ? { displayName: data.full_name } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(typeof data.pins === 'number' ? { posts: data.pins } : {}),
    ...(data.url ? { url: data.url } : {}),
    ...(typeof data.boards === 'number' ? { extra: { boards: data.boards } } : {}),
  });
}

interface FbData {
  username?: string;
  name?: string;
  about?: string;
  avatar?: string;
  followers?: number;
  url?: string;
}

function normalizeFacebook(payload: unknown): StalkerResult {
  const data = ensureSuccess<FbData>(payload, '/api/stalk/facebook');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('covenant', '/api/stalk/facebook', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.about ? { bio: data.about } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(data.url ? { url: data.url } : {}),
  });
}

interface FfData {
  uid?: string | number;
  nickname?: string;
  level?: number;
  region?: string;
  exp?: number;
  rank?: string;
}

function normalizeFreefire(payload: unknown): StalkerResult {
  const data = ensureSuccess<FfData>(payload, '/api/stalk/freefire');
  const uid = data.uid !== undefined ? String(data.uid) : '';
  if (!uid) {
    throw new ProviderError('covenant', '/api/stalk/freefire', 'parse', { detail: 'no uid' });
  }
  const extra: Record<string, unknown> = {};
  if (typeof data.level === 'number') extra.level = data.level;
  if (data.region) extra.region = data.region;
  if (typeof data.exp === 'number') extra.exp = data.exp;
  if (data.rank) extra.rank = data.rank;
  return StalkerResultSchema.parse({
    username: uid,
    ...(data.nickname ? { displayName: data.nickname } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface MlData {
  userId?: string | number;
  zoneId?: string | number;
  nickname?: string;
  region?: string;
}

function normalizeMlbb(payload: unknown): StalkerResult {
  const data = ensureSuccess<MlData>(payload, '/api/stalk/mlbb');
  const userId = data.userId !== undefined ? String(data.userId) : '';
  if (!userId) {
    throw new ProviderError('covenant', '/api/stalk/mlbb', 'parse', { detail: 'no userId' });
  }
  const extra: Record<string, unknown> = {};
  if (data.zoneId !== undefined) extra.zoneId = String(data.zoneId);
  if (data.region) extra.region = data.region;
  return StalkerResultSchema.parse({
    username: userId,
    ...(data.nickname ? { displayName: data.nickname } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface PixData {
  user_id?: string | number;
  name?: string;
  bio?: string;
  avatar?: string;
  premium?: boolean;
  following?: number;
  region?: string;
  webpage?: string;
  total_illusts?: number;
  total_manga?: number;
  total_novels?: number;
  url?: string;
}

function normalizePixiv(payload: unknown): StalkerResult {
  const data = ensureSuccess<PixData>(payload, '/api/stalk/pixiv');
  const userId = data.user_id !== undefined ? String(data.user_id) : '';
  if (!userId) {
    throw new ProviderError('covenant', '/api/stalk/pixiv', 'parse', { detail: 'no user_id' });
  }
  const extra: Record<string, unknown> = {};
  if (typeof data.premium === 'boolean') extra.premium = data.premium;
  if (data.region) extra.region = data.region;
  if (data.webpage) extra.webpage = data.webpage;
  if (typeof data.total_illusts === 'number') extra.illusts = data.total_illusts;
  if (typeof data.total_manga === 'number') extra.manga = data.total_manga;
  if (typeof data.total_novels === 'number') extra.novels = data.total_novels;
  return StalkerResultSchema.parse({
    username: userId,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.avatar ? { avatarUrl: data.avatar } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(data.url ? { url: data.url } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface WaData {
  number?: string;
  link?: string;
  name?: string;
  profile_pic?: string | null;
}

function normalizeWhatsapp(payload: unknown): StalkerResult {
  const data = ensureSuccess<WaData>(payload, '/api/stalk/whatsapp');
  const number = data.number ?? '';
  if (!number) {
    throw new ProviderError('covenant', '/api/stalk/whatsapp', 'parse', { detail: 'no number' });
  }
  return StalkerResultSchema.parse({
    username: number,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.profile_pic ? { avatarUrl: data.profile_pic } : {}),
    ...(data.link ? { url: data.link } : {}),
  });
}

const NORMALIZERS: Partial<Record<StalkerService, (payload: unknown) => StalkerResult>> = {
  instagram: normalizeInstagram,
  tiktok: normalizeTiktok,
  twitter: normalizeTwitter,
  threads: normalizeThreads,
  pinterest: normalizePinterest,
  facebook: normalizeFacebook,
  freefire: normalizeFreefire,
  mlbb: normalizeMlbb,
  pixiv: normalizePixiv,
  whatsapp: normalizeWhatsapp,
};

export function normalizeStalker(service: StalkerService, payload: unknown): StalkerResult {
  const normalizer = NORMALIZERS[service];
  if (!normalizer) {
    throw new ProviderError('covenant', `stalk/${service}`, 'unsupported');
  }
  return normalizer(payload);
}
