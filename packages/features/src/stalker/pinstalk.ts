import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'pinstalk',
  aliases: ['pinterest_stalk'],
  description: 'Stalk Pinterest user.',
  usage: '/pinstalk <username>',
  examples: ['/pinstalk dims'],
  service: 'pinterest',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/pinstalk <username>`',
  header: '📌 Pinterest User',
});

export default feature;