interface CacheEntry {
  isAdmin: boolean;
  expiresAt: number;
}

export interface AdminCacheOptions {
  ttlMs?: number;
  max?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX = 5_000;

/**
 * Bounded TTL cache for `(chatId, userId) -> isAdmin` lookups. Keeps API
 * calls predictable for hot group chats and lets the adapter answer the
 * `requireGroupAdmin` guard cheaply.
 */
export class GroupAdminCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(options: AdminCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.max = options.max ?? DEFAULT_MAX;
    this.now = options.now ?? (() => Date.now());
  }

  get(chatId: string, userId: string): boolean | undefined {
    const key = this.key(chatId, userId);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.isAdmin;
  }

  set(chatId: string, userId: string, isAdmin: boolean): void {
    if (this.entries.size >= this.max) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
    this.entries.set(this.key(chatId, userId), {
      isAdmin,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  invalidateChat(chatId: string): void {
    const prefix = `${chatId}\u0000`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private key(chatId: string, userId: string): string {
    return `${chatId}\u0000${userId}`;
  }
}
