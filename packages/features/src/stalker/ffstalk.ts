import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'ffstalk',
  aliases: ['freefirestalk'],
  description: 'Stalk Free Fire UID.',
  usage: '/ffstalk <uid>',
  examples: ['/ffstalk 1234567890'],
  service: 'freefire',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/ffstalk <uid>`',
  header: '🔥 Free Fire',
});

export default feature;
