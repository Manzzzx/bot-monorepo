import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'threadsstalk',
  aliases: ['thstalk'],
  description: 'Stalk Threads user.',
  usage: '/threadsstalk <username>',
  examples: ['/threadsstalk google'],
  service: 'threads',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/threadsstalk <username>`',
  header: '🧵 Threads User',
});

export default feature;