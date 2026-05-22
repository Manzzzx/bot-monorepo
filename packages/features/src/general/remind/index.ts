import type { Feature } from '@bot/contracts';
import { cancelReminder, createReminder, listReminders } from './_handlers.js';
import { fireReminder } from './_subscriptions.js';

const remindFeature: Feature = {
  name: 'remind',
  version: '1.0.0',
  commands: [
    {
      name: 'remind',
      aliases: ['reminder'],
      description: 'Create a reminder.',
      usage: '/remind 10m drink water',
      handler: createReminder,
    },
    {
      name: 'reminders',
      aliases: ['myreminders'],
      description: 'List pending reminders.',
      usage: '/reminders',
      handler: listReminders,
    },
    {
      name: 'cancelreminder',
      aliases: ['cancel'],
      description: 'Cancel one of your reminders.',
      usage: '/cancelreminder <id>',
      handler: cancelReminder,
    },
  ],
  events: [
    {
      event: 'reminder.fire',
      handler: fireReminder,
    },
  ],
};

export default remindFeature;