import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'igdl',
  aliases: ['ig', 'instagram'],
  description: 'Download Instagram post / reel.',
  usage: '/igdl <url>',
  examples: ['/igdl https://www.instagram.com/reel/xxx'],
  service: 'igdl',
  domainPattern: /instagram\.com|instagr\.am/i,
  invalidDomainMessage: '❌ Link bukan Instagram yang valid.',
  fileExtension: 'mp4',
});

export default feature;