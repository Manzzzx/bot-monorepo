import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './crypto.js';

describe('crypto helpers', () => {
  it('roundtrips JSON with AES-256-GCM', () => {
    const key = randomBytes(32).toString('hex');
    const value = { nested: { ok: true }, count: 2 };

    const encrypted = encryptJson(value, key);

    expect(encrypted.iv).toMatch(/^[a-f0-9]{24}$/);
    expect(encrypted.authTag).toMatch(/^[a-f0-9]{32}$/);
    expect(decryptJson<typeof value>(encrypted, key)).toEqual(value);
  });

  it('fails with the wrong key', () => {
    const encrypted = encryptJson({ ok: true }, randomBytes(32).toString('hex'));

    expect(() => decryptJson(encrypted, randomBytes(32).toString('hex'))).toThrow();
  });
});
