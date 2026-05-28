import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'twitterstalk',
  aliases: ['xstalk'],
  description: 'Stalk Twitter / X user.',
  usage: '/twitterstalk <username>',
  examples: ['/twitterstalk elonmusk'],
  service: 'twitter',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/twitterstalk <username>`',
  header: '🐦 Twitter / X User',
});

export default feature;
