import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../errors.js';
import { normalizeStalker } from './stalker.js';

describe('covenant stalker normalizer', () => {
  it('parses instagram happy path', () => {
    const result = normalizeStalker('instagram', {
      status: true,
      code: 200,
      data: {
        username: 'instagram',
        full_name: 'Instagram',
        biography: 'official',
        profile_pic: 'https://cdn.example.com/u.jpg',
        flags: { is_verified: true, is_private: false },
        stats: { followers: 100, following: 1, posts: 200 },
        profile_url: 'https://www.instagram.com/instagram/',
      },
    });
    expect(result.username).toBe('instagram');
    expect(result.verified).toBe(true);
    expect(result.followers).toBe(100);
    expect(result.posts).toBe(200);
  });

  it('parses freefire by uid', () => {
    const result = normalizeStalker('freefire', {
      status: true,
      code: 200,
      data: { uid: 1234567890, nickname: 'gamer', level: 70, region: 'ID' },
    });
    expect(result.username).toBe('1234567890');
    expect(result.displayName).toBe('gamer');
    expect(result.extra?.level).toBe(70);
    expect(result.extra?.region).toBe('ID');
  });

  it('parses whatsapp by number', () => {
    const result = normalizeStalker('whatsapp', {
      status: true,
      code: 200,
      data: {
        number: '6281234567890',
        link: 'https://wa.me/6281234567890',
        name: 'Share on WhatsApp',
      },
    });
    expect(result.username).toBe('6281234567890');
    expect(result.url).toBe('https://wa.me/6281234567890');
  });

  it('parses mlbb with zoneId in extra', () => {
    const result = normalizeStalker('mlbb', {
      status: true,
      code: 200,
      data: { userId: '123456789', zoneId: 1234, nickname: 'noob' },
    });
    expect(result.username).toBe('123456789');
    expect(result.extra?.zoneId).toBe('1234');
    expect(result.displayName).toBe('noob');
  });

  it('maps 500 envelope to http error', () => {
    try {
      normalizeStalker('freefire', {
        status: false,
        code: 500,
        message: 'Internal Server Error',
      });
    } catch (error) {
      expect((error as ProviderError).kind).toBe('http');
      expect((error as ProviderError).status).toBe(500);
      return;
    }
    throw new Error('expected throw');
  });

  it('throws unsupported for github (siputzx-only)', () => {
    expect(() => normalizeStalker('github', { status: true, code: 200, data: {} })).toThrow(
      /unsupported/,
    );
  });
});
