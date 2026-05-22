import { Cron } from 'croner';
import type { AppContext, Scheduler } from '@bot/contracts';
import { reminderRepo } from '@bot/db';

export interface SchedulerOptions {
  cronExpression?: string;
  batchSize?: number;
  timer?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
}

interface PendingTimer {
  timeout: NodeJS.Timeout;
  key: string;
}

export class SchedulerImpl implements Scheduler {
  private readonly cronExpression: string;
  private readonly batchSize: number;
  private readonly timer: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  private cron: Cron | null = null;
  private readonly pending = new Map<string, PendingTimer>();

  constructor(
    private readonly app: Pick<AppContext, 'bus' | 'logger' | 'db'>,
    options: SchedulerOptions = {},
  ) {
    this.cronExpression = options.cronExpression ?? '*/30 * * * * *';
    this.batchSize = options.batchSize ?? 50;
    this.timer = options.timer ?? { setTimeout, clearTimeout };
  }

  start(): void {
    if (this.cron) return;
    this.cron = new Cron(this.cronExpression, { protect: true }, () => this.tick());
  }

  async stop(): Promise<void> {
    if (this.cron) {
      this.cron.stop();
      this.cron = null;
    }
    for (const entry of this.pending.values()) {
      this.timer.clearTimeout(entry.timeout);
    }
    this.pending.clear();
  }

  async tick(): Promise<void> {
    try {
      const due = await reminderRepo.claimDue(
        this.app.db as Parameters<typeof reminderRepo.claimDue>[0],
        this.batchSize,
        new Date(),
      );
      for (const reminder of due) {
        try {
          await this.app.bus.emit('reminder.fire', reminder);
        } catch (error) {
          this.app.logger.error(
            { err: error, reminderId: reminder.id, status: 'error' },
            'Scheduler reminder emit failed',
          );
        }
      }
    } catch (error) {
      this.app.logger.error({ err: error, status: 'error' }, 'Scheduler tick failed');
    }
  }

  async catchup(): Promise<void> {
    await this.tick();
  }

  async scheduleOnce(at: Date, key: string, payload: unknown): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) {
      this.timer.clearTimeout(existing.timeout);
    }

    const delay = Math.max(0, at.getTime() - Date.now());
    const timeout = this.timer.setTimeout(() => {
      this.pending.delete(key);
      void Promise.resolve(this.app.bus.emit('reminder.fire', payload)).catch((error: unknown) => {
        this.app.logger.error(
          { err: error, reminderKey: key, status: 'error' },
          'Scheduled reminder emit failed',
        );
      });
    }, delay);

    this.pending.set(key, { timeout, key });
  }
}
