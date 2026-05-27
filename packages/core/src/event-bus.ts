import type {
  AppContext,
  EventBus,
  EventHandler,
  EventName,
  EventPayloads,
} from '@bot/contracts';
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

  async emit<E extends EventName>(event: E, payload: EventPayloads[E]): Promise<void> {
    const app = this.app;
    if (!app) throw new BotError('EventBus app context is not bound.', 'EVENT_BUS_UNBOUND');

    const handlers = [...(this.handlers.get(event) ?? [])];
    await Promise.all(handlers.map((handler) => handler(payload as never, app)));
  }
}
