import type { AppContext } from '@bot/contracts';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from './event-bus.js';

describe('InMemoryEventBus', () => {
  it('awaits async event handlers', async () => {
    const app = { logger: { error: vi.fn() } } as unknown as AppContext;
    const bus = new InMemoryEventBus(app);
    const seen: unknown[] = [];

    bus.on('message', async (payload, currentApp) => {
      await Promise.resolve();
      seen.push(payload, currentApp);
    });

    await bus.emit('message', { text: 'hi' } as unknown as Parameters<typeof bus.emit<'message'>>[1]);

    expect(seen).toEqual([{ text: 'hi' }, app]);
  });
});
