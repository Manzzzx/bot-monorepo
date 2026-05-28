import { describe, expect, it } from 'vitest';
import { canonicalWaId, isOwnerMatch } from './owner-id.js';

describe('canonicalWaId', () => {
  it('passes through bare local part unchanged', () => {
    expect(canonicalWaId('628123')).toBe('628123');
  });

  it('keeps the domain when present', () => {
    expect(canonicalWaId('628123@s.whatsapp.net')).toBe('628123@s.whatsapp.net');
  });

  it('strips device suffix from the local part', () => {
    expect(canonicalWaId('628123:42@s.whatsapp.net')).toBe('628123@s.whatsapp.net');
  });

  it('strips device suffix even when no domain is present', () => {
    expect(canonicalWaId('628123:0')).toBe('628123');
  });

  it('trims surrounding whitespace', () => {
    expect(canonicalWaId('  628123:0@s.whatsapp.net  ')).toBe('628123@s.whatsapp.net');
  });
});

describe('isOwnerMatch', () => {
  it('returns false when either side is missing', () => {
    expect(isOwnerMatch('wa', undefined, '628123')).toBe(false);
    expect(isOwnerMatch('wa', '628123', null)).toBe(false);
    expect(isOwnerMatch('wa', '', '')).toBe(false);
  });

  it('does an exact comparison for telegram', () => {
    expect(isOwnerMatch('tele', '12345', '12345')).toBe(true);
    expect(isOwnerMatch('tele', '12345:0', '12345')).toBe(false);
  });

  it('matches WhatsApp JIDs across device suffixes and bare local parts', () => {
    expect(isOwnerMatch('wa', '628123:42@s.whatsapp.net', '628123@s.whatsapp.net')).toBe(true);
    expect(isOwnerMatch('wa', '628123:7@s.whatsapp.net', '628123')).toBe(true);
    expect(isOwnerMatch('wa', '628123', '628123:0@s.whatsapp.net')).toBe(true);
  });

  it('rejects different WhatsApp identities', () => {
    expect(isOwnerMatch('wa', '628999:0@s.whatsapp.net', '628123@s.whatsapp.net')).toBe(false);
  });
});
