import type { AdapterRegistry, MessageAdapter, Platform } from '@bot/contracts';

export class AdapterRegistryImpl implements AdapterRegistry {
  private readonly adapters = new Map<Platform, MessageAdapter>();

  register(adapter: MessageAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: Platform): MessageAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`Adapter not registered for platform '${platform}'.`);
    return adapter;
  }

  has(platform: Platform): boolean {
    return this.adapters.has(platform);
  }
}
