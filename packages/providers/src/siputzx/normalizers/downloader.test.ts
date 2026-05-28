import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../errors.js';
import { normalizeDownloader } from './downloader.js';

describe('siputzx downloader normalizer', () => {
  it('parses tiktok happy path and prefers HD media', () => {
    const payload = {
      status: true,
      data: {
        type: 'video',
        title: 'sample',
        author: 'tester',
        thumbnail: 'https://cdn.example.com/cover.jpg',
        media: [
          { quality: 'SD', type: 'video', url: 'https://cdn.example.com/sd.mp4' },
          { quality: 'HD', type: 'video_hd', url: 'https://cdn.example.com/hd.mp4' },
        ],
      },
    };
    const result = normalizeDownloader('tiktok', payload);
    expect(result.type).toBe('video');
    expect(result.url).toBe('https://cdn.example.com/hd.mp4');
    expect(result.title).toBe('sample');
    expect(result.author).toBe('tester');
    expect(result.thumbnailUrl).toBe('https://cdn.example.com/cover.jpg');
  });

  it('throws ProviderError(http) when envelope status is false', () => {
    expect(() =>
      normalizeDownloader('tiktok', { status: false, code: 503, error: 'All nodes failed' }),
    ).toThrow(ProviderError);
    try {
      normalizeDownloader('tiktok', { status: false, code: 503, error: 'All nodes failed' });
    } catch (error) {
      expect((error as ProviderError).kind).toBe('http');
      expect((error as ProviderError).status).toBe(503);
    }
  });

  it('throws ProviderError(parse) when no media url', () => {
    expect(() =>
      normalizeDownloader('tiktok', { status: true, data: { type: 'video', media: [] } }),
    ).toThrow(/parse/);
  });

  it('parses twitter happy path', () => {
    const result = normalizeDownloader('twitter', {
      status: true,
      data: {
        downloadLink: 'https://cdn.example.com/x.mp4',
        videoTitle: 'tweet',
        imgUrl: 'https://cdn.example.com/thumb.jpg',
      },
    });
    expect(result.type).toBe('video');
    expect(result.url).toBe('https://cdn.example.com/x.mp4');
  });

  it('parses spotify happy path', () => {
    const result = normalizeDownloader('spotify', {
      status: true,
      data: {
        download: 'https://cdn.example.com/song.mp3',
        title: 'lagu',
        artist: 'penyanyi',
      },
    });
    expect(result.type).toBe('audio');
    expect(result.url).toBe('https://cdn.example.com/song.mp3');
    expect(result.author).toBe('penyanyi');
  });

  it('throws unsupported for service without normalizer', () => {
    expect(() => normalizeDownloader('pinterest', { status: true, data: {} })).toThrow(
      /unsupported/,
    );
  });
});
