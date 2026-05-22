import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '@bot/contracts';
import { SchedulerImpl } from './scheduler.js';

vi.mock('@bot/db', () => ({
  reminderRepo: {
    claimDue: vi.fn(),
  },
}));

const { reminderRepo } = await import('@bot/db');

afterEach(() => {
  vi.clearAllMocks();
});

describe('SchedulerImpl', () => {
  it('emits reminder.fire for each due reminder on tick', async () => {
    const emit = vi.fn();
    const due = [
      { id: 'r1', chatId: 'c', platform: 'wa', text: 'a', status: 'firing' },
      { id: 'r2', chatId: 'c', platform: 'wa', text: 'b', status: 'firing' },
    ];
    (reminderRepo.claimDue as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(due);

    const scheduler = new SchedulerImpl({
      bus: { emit, on: vi.fn() } as unknown as AppContext['bus'],
      logger: { error: vi.fn() } as unknown as AppContext['logger'],
      db: {} as unknown as AppContext['db'],
    });

    await scheduler.tick();

    expect(reminderRepo.claimDue).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, 'reminder.fire', due[0]);
    expect(emit).toHaveBeenNthCalledWith(2, 'reminder.fire', due[1]);
  });

  it('continues emitting due reminders when one emit fails', async () => {
    const emit = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const logger = { error: vi.fn() };
    const due = [
      { id: 'r1', chatId: 'c', platform: 'wa', text: 'a', status: 'firing' },
      { id: 'r2', chatId: 'c', platform: 'wa', text: 'b', status: 'firing' },
    ];
    (reminderRepo.claimDue as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(due);

    const scheduler = new SchedulerImpl({
      bus: { emit, on: vi.fn() } as unknown as AppContext['bus'],
      logger: logger as unknown as AppContext['logger'],
      db: {} as unknown as AppContext['db'],
    });

    await scheduler.tick();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, 'reminder.fire', due[1]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reminderId: 'r1', status: 'error' }),
      'Scheduler reminder emit failed',
    );
  });

  it('schedules a one-off reminder via setTimeout', async () => {
    let captured: (() => void) | null = null;
    const fakeTimeout: typeof setTimeout = ((fn: () => void) => {
      captured = fn;
      return 1 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
    const emit = vi.fn();

    const scheduler = new SchedulerImpl(
      {
        bus: { emit, on: vi.fn() } as unknown as AppContext['bus'],
        logger: { error: vi.fn() } as unknown as AppContext['logger'],
        db: {} as unknown as AppContext['db'],
      },
      {
        timer: {
          setTimeout: fakeTimeout,
          clearTimeout: (() => undefined) as unknown as typeof clearTimeout,
        },
      },
    );

    await scheduler.scheduleOnce(new Date(Date.now() + 10), 'reminder:1', { id: 'r1' });
    expect(captured).not.toBeNull();
    (captured as unknown as () => void)();
    expect(emit).toHaveBeenCalledWith('reminder.fire', { id: 'r1' });
  });

  it('logs one-off reminder emit failures', async () => {
    let captured: (() => void) | null = null;
    const fakeTimeout: typeof setTimeout = ((fn: () => void) => {
      captured = fn;
      return 1 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
    const emit = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const logger = { error: vi.fn() };

    const scheduler = new SchedulerImpl(
      {
        bus: { emit, on: vi.fn() } as unknown as AppContext['bus'],
        logger: logger as unknown as AppContext['logger'],
        db: {} as unknown as AppContext['db'],
      },
      {
        timer: {
          setTimeout: fakeTimeout,
          clearTimeout: (() => undefined) as unknown as typeof clearTimeout,
        },
      },
    );

    await scheduler.scheduleOnce(new Date(Date.now() + 10), 'reminder:1', { id: 'r1' });
    expect(captured).not.toBeNull();
    (captured as unknown as () => void)();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reminderKey: 'reminder:1', status: 'error' }),
      'Scheduled reminder emit failed',
    );
  });
});
