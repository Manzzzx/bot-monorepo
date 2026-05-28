import type { Feature } from '@bot/contracts';
import { createStalkerFeature, singleArgQuery } from './_shared.js';

const feature: Feature = createStalkerFeature({
  name: 'wastalk',
  aliases: ['whatsappstalk'],
  description: 'Cek info nomor WhatsApp.',
  usage: '/wastalk <number>',
  examples: ['/wastalk 6281234567890'],
  service: 'whatsapp',
  argsMin: 1,
  buildQuery: singleArgQuery,
  invalidArgsMessage: '❌ Sertakan target. Cara pakai: `/wastalk <number>`',
  header: '💬 WhatsApp Number',
});

export default feature;
