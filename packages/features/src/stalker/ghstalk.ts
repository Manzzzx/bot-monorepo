import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'ghstalk',
  aliases: ['gh'],
  description: 'Stalk GitHub user.',
  usage: '/ghstalk <username>',
  examples: ['/ghstalk octocat'],
  service: 'github',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/ghstalk <username>`',
  header: '💻 GitHub User',
});

export default feature;
