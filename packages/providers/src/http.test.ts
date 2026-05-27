import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('undici', () => ({ request: requestMock }));

import { HttpClient } from './http.js';
import { ProviderError } from './errors.js';

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: { json: async () => body },
  };
}

async function* asyncBuffers(parts: Buffer[]): AsyncIterable<Buffer> {
  for (const part of parts) yield part;
}

function streamResponse(statusCode: number, parts: Buffer[], mimeType = 'video/mp4') {
  return {
    statusCode,
    headers: { 'content-type': mimeType },
    body: asyncBuffers(parts),
  };
}

beforeEach(() => requestMock.mockReset());
afterEach(() => requestMock.mockReset());

describe('HttpClient.get', () => {
  it('parses JSON success', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, value: 42 }));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    const result = await http.get<{ value: number }>('siputzx', 'https://api.example.com/x', {
      query: { url: 'https://target.com' },
    });
    expect(result.value).toBe(42);
    expect(requestMock).toHaveBeenCalledTimes(1);
    const calledUrl = requestMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('url=https');
  });

  it('maps 400 to validation', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(400, { error: 'bad' }));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.get('siputzx', 'https://api/x')).rejects.toMatchObject({
      kind: 'validation',
      status: 400,
    });
  });

  it('maps 401 and 403 to unauthorized', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(401, {}));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.get('covenant', 'https://api/x')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    requestMock.mockResolvedValueOnce(jsonResponse(403, {}));
    await expect(http.get('covenant', 'https://api/x')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('maps 429 to rate_limit', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(429, {}));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.get('siputzx', 'https://api/x')).rejects.toMatchObject({
      kind: 'rate_limit',
    });
  });

  it('maps 5xx to http', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(503, {}));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.get('siputzx', 'https://api/x')).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    });
  });

  it('injects headers', async () => {
    requestMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await http.get('covenant', 'https://api/x', { headers: { 'x-api-key': 'KEY' } });
    const opts = requestMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(opts.headers['x-api-key']).toBe('KEY');
  });

  it('classifies parse errors as ProviderError parse', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        json: async () => {
          throw new Error('bad json');
        },
      },
    });
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.get('siputzx', 'https://api/x')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('wraps unexpected errors as http kind', async () => {
    requestMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    const error = await http.get('siputzx', 'https://api/x').catch((err) => err);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe('http');
  });
});

describe('HttpClient.fetchBuffer', () => {
  it('returns buffer and mime', async () => {
    requestMock.mockResolvedValueOnce(streamResponse(200, [Buffer.from('abc')]));
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    const result = await http.fetchBuffer('https://cdn/x.mp4', { maxBytes: 1024 });
    expect(result.buffer.toString()).toBe('abc');
    expect(result.mimeType).toBe('video/mp4');
  });

  it('throws validation when over maxBytes', async () => {
    requestMock.mockResolvedValueOnce(
      streamResponse(200, [Buffer.alloc(600), Buffer.alloc(600)]),
    );
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(
      http.fetchBuffer('https://cdn/x.mp4', { maxBytes: 1000 }),
    ).rejects.toMatchObject({ kind: 'validation', detail: 'file_too_large' });
  });

  it('maps 4xx to validation/unauthorized/rate_limit', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 404,
      headers: {},
      body: asyncBuffers([]),
    });
    const http = new HttpClient({ timeoutMs: 1000, minTimeMs: 0, maxConcurrent: 4 });
    await expect(http.fetchBuffer('https://cdn/missing', { maxBytes: 1024 })).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
  });
});