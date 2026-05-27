import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'ytstalk',
  aliases: ['youtubestalk'],
  description: 'Stalk YouTube channel.',
  usage: '/ytstalk <handle>',
  examples: ['/ytstalk @mrbeast'],
  service: 'youtube',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/ytstalk <handle>`',
  header: '📺 YouTube Channel',
});

export default feature;