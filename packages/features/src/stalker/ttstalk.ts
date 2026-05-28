import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'ttstalk',
  aliases: ['tts'],
  description: 'Stalk TikTok user.',
  usage: '/ttstalk <username>',
  examples: ['/ttstalk mrbeast'],
  service: 'tiktok',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/ttstalk <username>`',
  header: '🎬 TikTok User',
});

export default feature;
