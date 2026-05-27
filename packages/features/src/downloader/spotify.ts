import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'spotify',
  aliases: ['sp'],
  description: 'Download lagu dari Spotify.',
  usage: '/spotify <url>',
  examples: ['/spotify https://open.spotify.com/track/xxx'],
  service: 'spotify',
  domainPattern: /spotify\.com|spoti\.fi/i,
  invalidDomainMessage: '❌ Link bukan Spotify yang valid.',
  fileExtension: 'mp3',
});

export default feature;