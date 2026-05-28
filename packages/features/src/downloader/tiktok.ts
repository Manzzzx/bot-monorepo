import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Download video TikTok.',
  usage: '/tiktok <url>',
  examples: ['/tiktok https://vt.tiktok.com/abc'],
  service: 'tiktok',
  domainPattern: /tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/i,
  invalidDomainMessage: '❌ Link bukan TikTok yang valid.',
  fileExtension: 'mp4',
});

export default feature;
