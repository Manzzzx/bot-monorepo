import type { Logger } from 'pino';

export interface CircuitConfig {
  threshold: number;
  cooldownMs: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

interface Entry {
  state: CircuitState;
  consecutiveFails: number;
  openedAt?: number;
}

export class CircuitBreaker {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly config: CircuitConfig,
    private readonly logger?: Logger,
  ) {}

  isOpen(provider: string): boolean {
    const entry = this.entry(provider);
    if (entry.state !== 'open') return false;
    const elapsed = Date.now() - (entry.openedAt ?? 0);
    if (elapsed >= this.config.cooldownMs) {
      this.transition(provider, entry, 'half-open');
      return false;
    }
    return true;
  }

  recordSuccess(provider: string): void {
    const entry = this.entry(provider);
    entry.consecutiveFails = 0;
    if (entry.state !== 'closed') this.transition(provider, entry, 'closed');
  }

  recordFailure(provider: string): void {
    const entry = this.entry(provider);
    if (entry.state === 'half-open') {
      entry.openedAt = Date.now();
      this.transition(provider, entry, 'open');
      return;
    }
    entry.consecutiveFails += 1;
    if (entry.consecutiveFails >= this.config.threshold) {
      entry.openedAt = Date.now();
      this.transition(provider, entry, 'open');
    }
  }

  private entry(provider: string): Entry {
    let entry = this.entries.get(provider);
    if (!entry) {
      entry = { state: 'closed', consecutiveFails: 0 };
      this.entries.set(provider, entry);
    }
    return entry;
  }

  private transition(provider: string, entry: Entry, next: CircuitState): void {
    const prev = entry.state;
    if (prev === next) return;
    entry.state = next;
    if (next === 'closed') entry.consecutiveFails = 0;
    this.logger?.info(
      {
        component: 'providers.circuit',
        provider,
        transition: `${prev}->${next}`,
        consecutiveFails: entry.consecutiveFails,
      },
      `circuit ${provider}: ${prev}->${next}`,
    );
  }
}