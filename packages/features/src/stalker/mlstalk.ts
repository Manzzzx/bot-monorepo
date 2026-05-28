import type { Feature } from '@bot/contracts';
import { createStalkerFeature } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'mlstalk',
  aliases: ['mlbbstalk'],
  description: 'Stalk Mobile Legends ID + Zone.',
  usage: '/mlstalk <userId> <zoneId>',
  examples: ['/mlstalk 123456789 1234'],
  service: 'mlbb',
  argsMin: 2,
  buildQuery(args) {
    const userId = args[0]?.trim();
    const zoneId = args[1]?.trim();
    if (!userId || !zoneId) return null;
    return { username: userId, extra: { zoneId } };
  },
  invalidArgsMessage: '❌ Sertakan userId & zoneId. Cara pakai: `/mlstalk <userId> <zoneId>`',
  header: '⚔️ Mobile Legends',
});

export default feature;
