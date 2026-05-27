import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'igstalk',
  aliases: ['igs'],
  description: 'Stalk Instagram user.',
  usage: '/igstalk <username>',
  examples: ['/igstalk instagram'],
  service: 'instagram',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/igstalk <username>`',
  header: '📷 Instagram User',
});

export default feature;