export const COVENANT_BASE = 'https://api.covenant.sbs';

export const COVENANT_DOWNLOADER = {
  tiktok: '/api/downloader/tiktok',
  igdl: '/api/downloader/instagram',
  fbdl: '/api/downloader/facebook',
  twitter: '/api/downloader/twitter',
  ytmp3: '/api/downloader/yt',
  ytmp4: '/api/downloader/yt',
  spotify: '/api/downloader/aio',
  pinterest: '/api/downloader/pinterest',
  sfile: '/api/downloader/sfile',
} as const;

export const COVENANT_STALKER = {
  instagram: '/api/stalk/instagram',
  tiktok: '/api/stalk/tiktok',
  twitter: '/api/stalk/twitter',
  threads: '/api/stalk/threads',
  pinterest: '/api/stalk/pinterest',
  facebook: '/api/stalk/facebook',
  freefire: '/api/stalk/freefire',
  mlbb: '/api/stalk/mlbb',
  pixiv: '/api/stalk/pixiv',
  whatsapp: '/api/stalk/whatsapp',
} as const;

export const COVENANT_STALKER_PARAM: Record<string, string> = {
  freefire: 'uid',
  whatsapp: 'number',
  mlbb: 'userId',
};