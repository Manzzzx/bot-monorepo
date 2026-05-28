import { describe, expect, it } from 'vitest';
import { GroupAdminCache } from './group-admin-cache.js';

describe('GroupAdminCache', () => {
  it('returns undefined for unknown entries', () => {
    const cache = new GroupAdminCache();
    expect(cache.get('chat', 'user')).toBeUndefined();
  });

  it('stores and reads entries within ttl', () => {
    let now = 1_000;
    const cache = new GroupAdminCache({ ttlMs: 1_000, now: () => now });
    cache.set('chat', 'user', true);
    expect(cache.get('chat', 'user')).toBe(true);
    now = 1_500;
    expect(cache.get('chat', 'user')).toBe(true);
  });

  it('expires entries after ttl', () => {
    let now = 0;
    const cache = new GroupAdminCache({ ttlMs: 100, now: () => now });
    cache.set('chat', 'user', true);
    now = 200;
    expect(cache.get('chat', 'user')).toBeUndefined();
  });

  it('evicts oldest entry once max is reached', () => {
    const cache = new GroupAdminCache({ max: 2 });
    cache.set('c', 'a', true);
    cache.set('c', 'b', false);
    cache.set('c', 'c', true);
    expect(cache.get('c', 'a')).toBeUndefined();
    expect(cache.get('c', 'b')).toBe(false);
    expect(cache.get('c', 'c')).toBe(true);
  });

  it('promotes hot entries on read so they survive eviction', () => {
    const cache = new GroupAdminCache({ max: 2 });
    cache.set('c', 'a', true);
    cache.set('c', 'b', true);
    // touch 'a' so it is now most-recent; 'b' becomes the eviction target
    expect(cache.get('c', 'a')).toBe(true);
    cache.set('c', 'c', true);
    expect(cache.get('c', 'b')).toBeUndefined();
    expect(cache.get('c', 'a')).toBe(true);
    expect(cache.get('c', 'c')).toBe(true);
  });

  it('invalidateChat drops entries scoped to a chat only', () => {
    const cache = new GroupAdminCache();
    cache.set('c1', 'u1', true);
    cache.set('c1', 'u2', false);
    cache.set('c2', 'u1', true);
    cache.invalidateChat('c1');
    expect(cache.get('c1', 'u1')).toBeUndefined();
    expect(cache.get('c1', 'u2')).toBeUndefined();
    expect(cache.get('c2', 'u1')).toBe(true);
  });
});
