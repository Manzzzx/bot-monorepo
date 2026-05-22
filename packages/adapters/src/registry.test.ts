import { describe, expect, it } from 'vitest';
import type { MessageAdapter } from '@bot/contracts';
import { AdapterRegistryImpl } from './registry.js';

describe('AdapterRegistryImpl', () => {
  it('throws when adapter not registered', () => {
    const registry = new AdapterRegistryImpl();
    expect(registry.has('wa')).toBe(false);
    expect(() => registry.get('wa')).toThrow(/Adapter not registered/);
  });

  it('resolves a registered adapter', () => {
    const registry = new AdapterRegistryImpl();
    const adapter: MessageAdapter = {
      platform: 'tele',
      sendMessage: async () => undefined,
    };
    registry.register(adapter);
    expect(registry.has('tele')).toBe(true);
    expect(registry.get('tele')).toBe(adapter);
  });
});
