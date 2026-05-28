import { describe, expect, it } from 'vitest';
import { DownloaderResultSchema, StalkerResultSchema } from './schemas.js';

describe('DownloaderResultSchema', () => {
  it('accepts minimal valid result', () => {
    const parsed = DownloaderResultSchema.parse({
      type: 'video',
      url: 'https://cdn.example.com/x.mp4',
    });
    expect(parsed.type).toBe('video');
    expect(parsed.url).toBe('https://cdn.example.com/x.mp4');
  });

  it('rejects invalid url', () => {
    expect(() => DownloaderResultSchema.parse({ type: 'video', url: 'not-a-url' })).toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => DownloaderResultSchema.parse({ type: 'foo', url: 'https://cdn/x' })).toThrow();
  });

  it('preserves optional metadata', () => {
    const parsed = DownloaderResultSchema.parse({
      type: 'audio',
      url: 'https://cdn.example.com/a.mp3',
      title: 'song',
      author: 'someone',
      durationSec: 180,
      thumbnailUrl: 'https://cdn.example.com/cover.jpg',
      sizeBytes: 4096,
    });
    expect(parsed.title).toBe('song');
    expect(parsed.author).toBe('someone');
    expect(parsed.durationSec).toBe(180);
    expect(parsed.sizeBytes).toBe(4096);
  });
});

describe('StalkerResultSchema', () => {
  it('accepts minimal valid result', () => {
    const parsed = StalkerResultSchema.parse({ username: 'octocat' });
    expect(parsed.username).toBe('octocat');
  });

  it('rejects when username missing', () => {
    expect(() => StalkerResultSchema.parse({})).toThrow();
  });

  it('rejects empty username', () => {
    expect(() => StalkerResultSchema.parse({ username: '' })).toThrow();
  });

  it('preserves extra map', () => {
    const parsed = StalkerResultSchema.parse({
      username: 'octocat',
      extra: { repos: 8, location: 'sf' },
    });
    expect(parsed.extra?.repos).toBe(8);
    expect(parsed.extra?.location).toBe('sf');
  });
});
