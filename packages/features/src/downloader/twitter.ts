import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'twitter',
  aliases: ['tw', 'x'],
  description: 'Download video Twitter / X.',
  usage: '/twitter <url>',
  examples: ['/twitter https://twitter.com/user/status/xxx'],
  service: 'twitter',
  domainPattern: /twitter\.com|x\.com|t\.co/i,
  invalidDomainMessage: '❌ Link bukan Twitter / X yang valid.',
  fileExtension: 'mp4',
});

export default feature;
