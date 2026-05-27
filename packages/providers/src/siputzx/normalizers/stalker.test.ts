import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../errors.js';
import { normalizeStalker } from './stalker.js';

describe('siputzx stalker normalizer', () => {
  it('parses github happy path', () => {
    const result = normalizeStalker('github', {
      status: true,
      data: {
        username: 'octocat',
        nickname: 'The Octocat',
        bio: 'hello',
        profile_pic: 'https://avatars.example.com/u.jpg',
        url: 'https://github.com/octocat',
        public_repo: 8,
        followers: 100,
        following: 9,
        company: '@github',
      },
    });
    expect(result.username).toBe('octocat');
    expect(result.displayName).toBe('The Octocat');
    expect(result.followers).toBe(100);
    expect(result.posts).toBe(8);
    expect(result.extra?.company).toBe('@github');
  });

  it('parses tiktok happy path with verified flag', () => {
    const result = normalizeStalker('tiktok', {
      status: true,
      data: {
        user: {
          uniqueId: 'mrbeast',
          nickname: 'MrBeast',
          signature: 'subscribe',
          avatarLarger: 'https://cdn/large.jpg',
          verified: true,
        },
        stats: { followerCount: 1, followingCount: 2, videoCount: 3, heartCount: 4 },
      },
    });
    expect(result.username).toBe('mrbeast');
    expect(result.verified).toBe(true);
    expect(result.followers).toBe(1);
    expect(result.posts).toBe(3);
  });

  it('throws ProviderError(http) on status:false envelope', () => {
    try {
      normalizeStalker('roblox', { status: false, code: 404, error: 'Route not found' });
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe('http');
      expect((error as ProviderError).status).toBe(404);
      return;
    }
    throw new Error('expected throw');
  });

  it('throws ProviderError(parse) when username missing', () => {
    expect(() =>
      normalizeStalker('github', { status: true, data: { nickname: 'noname' } }),
    ).toThrow(/parse/);
  });

  it('throws unsupported for non-mapped service', () => {
    expect(() => normalizeStalker('freefire', { status: true, data: {} })).toThrow(/unsupported/);
  });
});