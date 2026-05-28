import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'pinterest',
  aliases: ['pin'],
  description: 'Download pin Pinterest.',
  usage: '/pinterest <url>',
  examples: ['/pinterest https://pin.it/xxx'],
  service: 'pinterest',
  domainPattern: /pinterest\.com|pin\.it/i,
  invalidDomainMessage: '❌ Link bukan Pinterest yang valid.',
  fileExtension: 'jpg',
});

export default feature;
