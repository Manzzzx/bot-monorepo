import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'fbstalk',
  aliases: ['facebookstalk'],
  description: 'Stalk Facebook user.',
  usage: '/fbstalk <username>',
  examples: ['/fbstalk zuck'],
  service: 'facebook',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/fbstalk <username>`',
  header: '📘 Facebook User',
});

export default feature;
