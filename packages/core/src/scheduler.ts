import { Cron } from 'croner';
import type { AppContext, Scheduler } from '@bot/contracts';
import { reminderRepo } from '@bot/db';

export interface SchedulerOptions {
  cronExpression?: string;
  batchSize?: number;
  /** Reminders stuck in `firing` longer than this are reset to `pending`. */
  stuckRecoveryMs?: number;
  timer?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
}

interface PendingTimer {
  timeout: NodeJS.Timeout;
  key: string;
}

export class SchedulerImpl implements Scheduler {
  private readonly cronExpression: string;
  private readonly batchSize: number;
  private readonly stuckRecoveryMs: number;
  private readonly timer: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  private cron: Cron | null = null;
  private readonly pending = new Map<string, PendingTimer>();

  constructor(
    private readonly app: Pick<AppContext, 'bus' | 'logger' | 'db'>,
    options: SchedulerOptions = {},
  ) {
    this.cronExpression = options.cronExpression ?? '*/30 * * * * *';
    this.batchSize = options.batchSize ?? 50;
    this.stuckRecoveryMs = options.stuckRecoveryMs ?? 5 * 60_000;
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
      await this.recoverStuck();

      const due = await reminderRepo.claimDue(
        this.app.db as Parameters<typeof reminderRepo.claimDue>[0],
        this.batchSize,
        new Date(),
      );
      for (const reminder of due) {
        try {
          await this.app.bus.emit('reminder.fire', reminder as { id: string });
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

  private async recoverStuck(): Promise<void> {
    try {
      const result = await reminderRepo.recoverStuck(
        this.app.db as Parameters<typeof reminderRepo.recoverStuck>[0],
        this.stuckRecoveryMs,
      );
      if (result.count > 0) {
        this.app.logger.warn(
          { status: 'ok', recovered: result.count },
          'Scheduler recovered stuck reminders',
        );
      }
    } catch (error) {
      this.app.logger.error({ err: error, status: 'error' }, 'Scheduler stuck recovery failed');
    }
  }

  async scheduleOnce(at: Date, key: string, payload: unknown): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) {
      this.timer.clearTimeout(existing.timeout);
    }

    const delay = Math.max(0, at.getTime() - Date.now());
    const timeout = this.timer.setTimeout(() => {
      this.pending.delete(key);
      void Promise.resolve(this.app.bus.emit('reminder.fire', payload as { id: string })).catch(
        (error: unknown) => {
          this.app.logger.error(
            { err: error, reminderKey: key, status: 'error' },
            'Scheduled reminder emit failed',
          );
        },
      );
    }, delay);

    this.pending.set(key, { timeout, key });
  }
}
