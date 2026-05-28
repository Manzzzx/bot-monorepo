import type { AppContext, EventBus, EventHandler, EventName, EventPayloads } from '@bot/contracts';
import { BotError } from './errors.js';

type AnyHandler = EventHandler<EventName>;

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventName, Set<AnyHandler>>();

  constructor(private app?: AppContext) {}

  bindApp(app: AppContext): void {
    this.app = app;
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): void {
    const handlers = this.handlers.get(event) ?? new Set<AnyHandler>();
    handlers.add(handler as AnyHandler);
    this.handlers.set(event, handlers);
  }

  /**
   * Emit an event to every subscribed handler. Handlers are isolated: a single
   * rejection logs but never aborts the rest of the fan-out. This keeps the
   * pub/sub contract resilient when one feature throws (e.g. anti-link guard
   * misbehaves and a separate audit subscriber still needs to record).
   */
  async emit<E extends EventName>(event: E, payload: EventPayloads[E]): Promise<void> {
    const app = this.app;
    if (!app) throw new BotError('EventBus app context is not bound.', 'EVENT_BUS_UNBOUND');

    const handlers = [...(this.handlers.get(event) ?? [])];
    const results = await Promise.allSettled(
      handlers.map((handler) => Promise.resolve(handler(payload as never, app))),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        app.logger.error({ err: result.reason, event, status: 'error' }, 'Event handler rejected');
      }
    }
  }
}
