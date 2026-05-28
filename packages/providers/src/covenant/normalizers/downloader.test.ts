import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../errors.js';
import { normalizeDownloader } from './downloader.js';

describe('covenant downloader normalizer', () => {
  it('parses tiktok-style media response', () => {
    const result = normalizeDownloader('tiktok', {
      status: true,
      code: 200,
      data: {
        title: 'tt video',
        author: { name: 'creator' },
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        duration_seconds: 30,
        media: [{ type: 'video', url: 'https://cdn.example.com/video.mp4', size: 1024 }],
      },
    });
    expect(result.type).toBe('video');
    expect(result.url).toBe('https://cdn.example.com/video.mp4');
    expect(result.author).toBe('creator');
    expect(result.durationSec).toBe(30);
    expect(result.sizeBytes).toBe(1024);
  });

  it('prefers hd over url field', () => {
    const result = normalizeDownloader('fbdl', {
      status: true,
      code: 200,
      data: {
        title: 'fb',
        media: [
          {
            type: 'video',
            url: 'https://cdn.example.com/sd.mp4',
            hd: 'https://cdn.example.com/hd.mp4',
          },
        ],
      },
    });
    expect(result.url).toBe('https://cdn.example.com/hd.mp4');
  });

  it('maps 400 envelope to validation error', () => {
    try {
      normalizeDownloader('tiktok', {
        status: false,
        code: 400,
        message: 'invalid url',
        error: { type: 'INTERNAL_ERROR', detail: 'bad' },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).kind).toBe('validation');
      return;
    }
    throw new Error('expected throw');
  });

  it('maps 5xx envelope to http error', () => {
    try {
      normalizeDownloader('tiktok', {
        status: false,
        code: 503,
        message: 'service down',
      });
    } catch (error) {
      expect((error as ProviderError).kind).toBe('http');
      expect((error as ProviderError).status).toBe(503);
      return;
    }
    throw new Error('expected throw');
  });

  it('rejects aio when success:false', () => {
    expect(() =>
      normalizeDownloader('spotify', {
        status: true,
        code: 200,
        data: { success: false, message: 'link not found' },
      }),
    ).toThrow(/aio failed|link not found/);
  });

  it('parses pinterest image media', () => {
    const result = normalizeDownloader('pinterest', {
      status: true,
      code: 200,
      data: {
        title: 'pin',
        media: [{ type: 'image', url: 'https://cdn.example.com/pin.png', quality: 'hd' }],
      },
    });
    expect(result.type).toBe('image');
    expect(result.url).toBe('https://cdn.example.com/pin.png');
  });
});
