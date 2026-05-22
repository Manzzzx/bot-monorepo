export interface BotErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class BotError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'BOT_ERROR', options: BotErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    if (options.details) this.details = options.details;
  }
}

export class UserFacingError extends BotError {
  readonly userMessage: string;

  constructor(message: string, code = 'USER_FACING_ERROR', options: BotErrorOptions = {}) {
    super(message, code, options);
    this.userMessage = message;
  }
}

export class GuardRejection extends UserFacingError {
  constructor(message = 'Command not allowed.', options: BotErrorOptions = {}) {
    super(message, 'GUARD_REJECTION', options);
  }
}

export class CommandConflictError extends BotError {
  constructor(name: string, owner?: string) {
    super(
      owner
        ? `Command or alias '${name}' conflicts with '${owner}'.`
        : `Command or alias '${name}' is already registered.`,
      'COMMAND_CONFLICT',
      { details: { name, owner } },
    );
  }
}

export class UnknownCategoryError extends BotError {
  constructor(category: string) {
    super(`Unknown feature category '${category}'.`, 'UNKNOWN_CATEGORY', { details: { category } });
  }
}

export class FeatureConflictError extends BotError {
  constructor(featureName: string) {
    super(`Feature '${featureName}' is defined more than once.`, 'FEATURE_CONFLICT', {
      details: { featureName },
    });
  }
}
