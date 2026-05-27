import type { Feature } from '@bot/contracts';
import { createDownloaderFeature } from './_shared.js';

const feature: Feature = createDownloaderFeature({
  name: 'sfile',
  description: 'Download file dari sfile.mobi / sfile.co.',
  usage: '/sfile <url>',
  examples: ['/sfile https://sfile.mobi/abc'],
  service: 'sfile',
  domainPattern: /sfile\.(mobi|co)/i,
  invalidDomainMessage: '❌ Link bukan sfile yang valid.',
  fileExtension: 'bin',
});

export default feature;