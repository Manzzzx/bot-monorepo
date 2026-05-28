import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'fbdl',
  aliases: ['fb', 'facebook'],
  description: 'Download video Facebook.',
  usage: '/fbdl <url>',
  examples: ['/fbdl https://www.facebook.com/watch/?v=xxx'],
  service: 'fbdl',
  domainPattern: /facebook\.com|fb\.watch/i,
  invalidDomainMessage: '❌ Link bukan Facebook yang valid.',
  fileExtension: 'mp4',
});

export default feature;
