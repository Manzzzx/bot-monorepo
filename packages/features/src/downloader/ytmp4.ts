import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'ytmp4',
  aliases: ['ytv'],
  description: 'Download video dari YouTube.',
  usage: '/ytmp4 <url>',
  examples: ['/ytmp4 https://youtu.be/xxx'],
  service: 'ytmp4',
  domainPattern: /youtube\.com|youtu\.be/i,
  invalidDomainMessage: '❌ Link bukan YouTube yang valid.',
  fileExtension: 'mp4',
});

export default feature;