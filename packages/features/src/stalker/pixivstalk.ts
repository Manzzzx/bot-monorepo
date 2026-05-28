import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'pixivstalk',
  aliases: ['pix'],
  description: 'Stalk Pixiv user.',
  usage: '/pixivstalk <user_id>',
  examples: ['/pixivstalk 11'],
  service: 'pixiv',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/pixivstalk <user_id>`',
  header: '🎨 Pixiv User',
});

export default feature;
