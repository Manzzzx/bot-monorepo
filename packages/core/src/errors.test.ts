import { describe, expect, it } from 'vitest';
import {
  BotError,
  CommandConflictError,
  FeatureConflictError,
  GuardRejection,
  UnknownCategoryError,
  UserFacingError,
} from './errors.js';

describe('core errors', () => {
  it('keeps machine code and cause on BotError', () => {
    const cause = new Error('root');
    const error = new BotError('Broken', 'BROKEN', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('BROKEN');
    expect(error.cause).toBe(cause);
  });

  it('marks user-facing guard rejections safely', () => {
    const error = new GuardRejection('Owners only');

    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.code).toBe('GUARD_REJECTION');
    expect(error.userMessage).toBe('Owners only');
  });

  it('provides specific conflict/category errors', () => {
    expect(new CommandConflictError('ping')).toMatchObject({ code: 'COMMAND_CONFLICT' });
    expect(new UnknownCategoryError('admin')).toMatchObject({ code: 'UNKNOWN_CATEGORY' });
    expect(new FeatureConflictError('general/ping')).toMatchObject({ code: 'FEATURE_CONFLICT' });
  });
});
