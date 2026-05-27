import { ProviderError } from '../../errors.js';
import { StalkerResultSchema } from '../../schemas.js';
import type { StalkerResult, StalkerService } from '../../types.js';

interface Envelope<T> {
  status: boolean;
  data?: T;
  code?: number;
  error?: string;
}

function ensureSuccess<T>(payload: unknown, endpoint: string): T {
  const envelope = payload as Envelope<T>;
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

interface InstagramData {
  username?: string;
  full_name?: string;
  fullName?: string;
  biography?: string;
  profile_pic_url?: string;
  profile_pic?: string;
  is_verified?: boolean;
  is_private?: boolean;
  follower_count?: number;
  edge_followed_by?: { count?: number };
  following_count?: number;
  edge_follow?: { count?: number };
  media_count?: number;
  edge_owner_to_timeline_media?: { count?: number };
  external_url?: string;
}

function normalizeInstagram(payload: unknown): StalkerResult {
  const data = ensureSuccess<InstagramData>(payload, '/api/stalk/instagram');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/instagram', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.full_name ?? data.fullName
      ? { displayName: data.full_name ?? data.fullName }
      : {}),
    ...(data.biography ? { bio: data.biography } : {}),
    ...(data.profile_pic_url ?? data.profile_pic
      ? { avatarUrl: data.profile_pic_url ?? data.profile_pic }
      : {}),
    ...(typeof data.is_verified === 'boolean' ? { verified: data.is_verified } : {}),
    ...(typeof data.is_private === 'boolean' ? { private: data.is_private } : {}),
    ...(typeof data.follower_count === 'number'
      ? { followers: data.follower_count }
      : typeof data.edge_followed_by?.count === 'number'
        ? { followers: data.edge_followed_by.count }
        : {}),
    ...(typeof data.following_count === 'number'
      ? { following: data.following_count }
      : typeof data.edge_follow?.count === 'number'
        ? { following: data.edge_follow.count }
        : {}),
    ...(typeof data.media_count === 'number'
      ? { posts: data.media_count }
      : typeof data.edge_owner_to_timeline_media?.count === 'number'
        ? { posts: data.edge_owner_to_timeline_media.count }
        : {}),
    ...(data.external_url ? { url: data.external_url } : {}),
  });
}

interface TiktokData {
  user?: {
    uniqueId?: string;
    nickname?: string;
    signature?: string;
    avatarLarger?: string;
    avatarMedium?: string;
    verified?: boolean;
    privateAccount?: boolean;
  };
  stats?: {
    followerCount?: number;
    followingCount?: number;
    videoCount?: number;
    heartCount?: number;
  };
}

function normalizeTiktok(payload: unknown): StalkerResult {
  const data = ensureSuccess<TiktokData>(payload, '/api/stalk/tiktok');
  const username = data.user?.uniqueId ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/tiktok', 'parse', { detail: 'no username' });
  }
  const avatar = data.user?.avatarLarger ?? data.user?.avatarMedium;
  return StalkerResultSchema.parse({
    username,
    ...(data.user?.nickname ? { displayName: data.user.nickname } : {}),
    ...(data.user?.signature ? { bio: data.user.signature } : {}),
    ...(avatar ? { avatarUrl: avatar } : {}),
    ...(typeof data.user?.verified === 'boolean' ? { verified: data.user.verified } : {}),
    ...(typeof data.user?.privateAccount === 'boolean'
      ? { private: data.user.privateAccount }
      : {}),
    ...(typeof data.stats?.followerCount === 'number'
      ? { followers: data.stats.followerCount }
      : {}),
    ...(typeof data.stats?.followingCount === 'number'
      ? { following: data.stats.followingCount }
      : {}),
    ...(typeof data.stats?.videoCount === 'number' ? { posts: data.stats.videoCount } : {}),
    ...(data.stats
      ? { extra: { heartCount: data.stats.heartCount ?? 0 } }
      : {}),
  });
}

interface GithubData {
  username?: string;
  nickname?: string;
  bio?: string | null;
  profile_pic?: string;
  url?: string;
  public_repo?: number;
  followers?: number;
  following?: number;
  company?: string | null;
  location?: string | null;
  created_at?: string;
}

function normalizeGithub(payload: unknown): StalkerResult {
  const data = ensureSuccess<GithubData>(payload, '/api/stalk/github');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/github', 'parse', { detail: 'no username' });
  }
  const extra: Record<string, unknown> = {};
  if (typeof data.public_repo === 'number') extra.publicRepos = data.public_repo;
  if (data.company) extra.company = data.company;
  if (data.location) extra.location = data.location;
  if (data.created_at) extra.createdAt = data.created_at;
  return StalkerResultSchema.parse({
    username,
    ...(data.nickname ? { displayName: data.nickname } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.profile_pic ? { avatarUrl: data.profile_pic } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(typeof data.public_repo === 'number' ? { posts: data.public_repo } : {}),
    ...(data.url ? { url: data.url } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface TwitterData {
  username?: string;
  name?: string;
  description?: string;
  verified?: boolean;
  location?: string;
  created_at?: string;
  stats?: {
    tweets?: number;
    following?: number;
    followers?: number;
    likes?: number;
  };
  profile?: { image?: string; banner?: string };
}

function normalizeTwitter(payload: unknown): StalkerResult {
  const data = ensureSuccess<TwitterData>(payload, '/api/stalk/twitter');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/twitter', 'parse', { detail: 'no username' });
  }
  const extra: Record<string, unknown> = {};
  if (typeof data.stats?.likes === 'number') extra.likes = data.stats.likes;
  if (data.location) extra.location = data.location;
  if (data.created_at) extra.createdAt = data.created_at;
  return StalkerResultSchema.parse({
    username,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.description ? { bio: data.description } : {}),
    ...(data.profile?.image ? { avatarUrl: data.profile.image } : {}),
    ...(typeof data.verified === 'boolean' ? { verified: data.verified } : {}),
    ...(typeof data.stats?.followers === 'number' ? { followers: data.stats.followers } : {}),
    ...(typeof data.stats?.following === 'number' ? { following: data.stats.following } : {}),
    ...(typeof data.stats?.tweets === 'number' ? { posts: data.stats.tweets } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface ThreadsData {
  username?: string;
  name?: string;
  bio?: string;
  profile_picture?: string;
  hd_profile_picture?: string;
  is_verified?: boolean;
  followers?: number;
  links?: string[];
}

function normalizeThreads(payload: unknown): StalkerResult {
  const data = ensureSuccess<ThreadsData>(payload, '/api/stalk/threads');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/threads', 'parse', { detail: 'no username' });
  }
  const link = data.links?.[0];
  return StalkerResultSchema.parse({
    username,
    ...(data.name ? { displayName: data.name } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(data.hd_profile_picture ?? data.profile_picture
      ? { avatarUrl: data.hd_profile_picture ?? data.profile_picture }
      : {}),
    ...(typeof data.is_verified === 'boolean' ? { verified: data.is_verified } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(link ? { url: link } : {}),
  });
}

interface PinterestData {
  username?: string;
  full_name?: string;
  bio?: string;
  profile_url?: string;
  image?: { original?: string; large?: string };
  stats?: {
    pins?: number;
    followers?: number;
    following?: number;
    boards?: number;
  };
}

function normalizePinterest(payload: unknown): StalkerResult {
  const data = ensureSuccess<PinterestData>(payload, '/api/stalk/pinterest');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/pinterest', 'parse', { detail: 'no username' });
  }
  const avatar = data.image?.original ?? data.image?.large;
  return StalkerResultSchema.parse({
    username,
    ...(data.full_name ? { displayName: data.full_name } : {}),
    ...(data.bio ? { bio: data.bio } : {}),
    ...(avatar ? { avatarUrl: avatar } : {}),
    ...(typeof data.stats?.followers === 'number' ? { followers: data.stats.followers } : {}),
    ...(typeof data.stats?.following === 'number' ? { following: data.stats.following } : {}),
    ...(typeof data.stats?.pins === 'number' ? { posts: data.stats.pins } : {}),
    ...(data.profile_url ? { url: data.profile_url } : {}),
    ...(typeof data.stats?.boards === 'number'
      ? { extra: { boards: data.stats.boards } }
      : {}),
  });
}

interface YoutubeData {
  channel?: {
    username?: string;
    name?: string | null;
    subscriberCount?: string;
    videoCount?: string;
    avatarUrl?: string;
    channelUrl?: string;
    description?: string;
  };
}

function normalizeYoutube(payload: unknown): StalkerResult {
  const data = ensureSuccess<YoutubeData>(payload, '/api/stalk/youtube');
  const username = data.channel?.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/youtube', 'parse', { detail: 'no username' });
  }
  const extra: Record<string, unknown> = {};
  if (data.channel?.subscriberCount) extra.subscribers = data.channel.subscriberCount;
  if (data.channel?.videoCount) extra.videos = data.channel.videoCount;
  return StalkerResultSchema.parse({
    username,
    ...(data.channel?.name ? { displayName: data.channel.name } : {}),
    ...(data.channel?.description ? { bio: data.channel.description } : {}),
    ...(data.channel?.avatarUrl ? { avatarUrl: data.channel.avatarUrl } : {}),
    ...(data.channel?.channelUrl ? { url: data.channel.channelUrl } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

interface RobloxData {
  username?: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  followers?: number;
  following?: number;
  url?: string;
}

function normalizeRoblox(payload: unknown): StalkerResult {
  const data = ensureSuccess<RobloxData>(payload, '/api/stalk/roblox');
  const username = data.username ?? '';
  if (!username) {
    throw new ProviderError('siputzx', '/api/stalk/roblox', 'parse', { detail: 'no username' });
  }
  return StalkerResultSchema.parse({
    username,
    ...(data.displayName ? { displayName: data.displayName } : {}),
    ...(data.description ? { bio: data.description } : {}),
    ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
    ...(typeof data.followers === 'number' ? { followers: data.followers } : {}),
    ...(typeof data.following === 'number' ? { following: data.following } : {}),
    ...(data.url ? { url: data.url } : {}),
  });
}

const NORMALIZERS: Partial<Record<StalkerService, (payload: unknown) => StalkerResult>> = {
  instagram: normalizeInstagram,
  tiktok: normalizeTiktok,
  github: normalizeGithub,
  twitter: normalizeTwitter,
  threads: normalizeThreads,
  pinterest: normalizePinterest,
  youtube: normalizeYoutube,
  roblox: normalizeRoblox,
};

export function normalizeStalker(service: StalkerService, payload: unknown): StalkerResult {
  const normalizer = NORMALIZERS[service];
  if (!normalizer) {
    throw new ProviderError('siputzx', `stalk/${service}`, 'unsupported');
  }
  return normalizer(payload);
}