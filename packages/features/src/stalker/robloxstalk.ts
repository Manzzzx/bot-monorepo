import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'robloxstalk',
  aliases: ['rbstalk'],
  description: 'Stalk Roblox user.',
  usage: '/robloxstalk <username>',
  examples: ['/robloxstalk Roblox'],
  service: 'roblox',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/robloxstalk <username>`',
  header: '🟥 Roblox User',
});

export default feature;