import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'ytmp3',
  aliases: ['yta'],
  description: 'Download audio dari YouTube.',
  usage: '/ytmp3 <url>',
  examples: ['/ytmp3 https://youtu.be/xxx'],
  service: 'ytmp3',
  domainPattern: /youtube\.com|youtu\.be/i,
  invalidDomainMessage: '❌ Link bukan YouTube yang valid.',
  fileExtension: 'mp3',
});

export default feature;
