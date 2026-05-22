import { describe, expect, it, vi } from 'vitest';
import { performShutdown } from './shutdown.js';

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    flush: vi.fn(),
    child() {
      return this;
    },
  };
}

describe('performShutdown', () => {
  it('runs adapters → scheduler → prisma in order', async () => {
    const calls: string[] = [];
    const wa = {
      pause: vi.fn(() => calls.push('wa.pause')),
      stop: vi.fn(async () => {
        calls.push('wa.stop');
      }),
    };
    const tele = {
      pause: vi.fn(() => calls.push('tele.pause')),
      stop: vi.fn(async () => {
        calls.push('tele.stop');
      }),
    };
    const scheduler = {
      stop: vi.fn(async () => {
        calls.push('scheduler.stop');
      }),
    };
    const prisma = {
      $disconnect: vi.fn(async () => {
        calls.push('prisma.disconnect');
      }),
    };
    const exit = vi.fn();
    const logger = makeLogger();

    await performShutdown({
      logger: logger as unknown as Parameters<typeof performShutdown>[0]['logger'],
      prisma: prisma as unknown as Parameters<typeof performShutdown>[0]['prisma'],
      scheduler: scheduler as unknown as Parameters<typeof performShutdown>[0]['scheduler'],
      adapters: {
        wa: wa as unknown as Parameters<typeof performShutdown>[0]['adapters']['wa'],
        tele: tele as unknown as Parameters<typeof performShutdown>[0]['adapters']['tele'],
      },
      exit,
      inFlightTimeoutMs: 5,
    });

    expect(wa.pause).toHaveBeenCalled();
    expect(tele.pause).toHaveBeenCalled();
    const idxPauses = calls.indexOf('scheduler.stop');
    expect(calls.slice(0, idxPauses)).toEqual(['wa.pause', 'tele.pause']);
    expect(calls.indexOf('scheduler.stop')).toBeLessThan(calls.indexOf('wa.stop'));
    expect(calls.indexOf('wa.stop')).toBeLessThan(calls.indexOf('prisma.disconnect'));
    expect(exit).toHaveBeenCalledWith(0);
  });
});
