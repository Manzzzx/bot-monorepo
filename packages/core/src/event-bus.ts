import type { AppContext, EventBus, EventName } from '@bot/contracts';
import { BotError } from './errors.js';

type EventHandler = (payload: unknown, app: AppContext) => Promise<void> | void;

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventName, Set<EventHandler>>();

  constructor(private app?: AppContext) {}

  bindApp(app: AppContext): void {
    this.app = app;
  }

  on(event: EventName, handler: EventHandler): void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
  }

  async emit(event: EventName, payload: unknown): Promise<void> {
    const app = this.app;
    if (!app) throw new BotError('EventBus app context is not bound.', 'EVENT_BUS_UNBOUND');

    const handlers = [...(this.handlers.get(event) ?? [])];
    await Promise.all(handlers.map((handler) => handler(payload, app)));
  }
}
