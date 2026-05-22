import { describe, expect, it } from 'vitest';
import { getConfigWarnings, loadConfig } from './config.js';

const key = 'a'.repeat(64);

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig({ AUTH_ENCRYPTION_KEY: key, TELEGRAM_BOT_TOKEN: 'token' });

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      LOG_DIR: '/home/container/data/log',
      LOG_NO_COLOR: false,
      DATABASE_URL: 'file:/home/container/data/bot.db',
      AUTH_ENCRYPTION_KEY: key,
      WA_ENABLED: true,
      WA_RATE_MIN_TIME_MS: 800,
      TELE_ENABLED: true,
      TELE_RATE_MIN_TIME_MS: 50,
    });
  });

  it('rejects invalid encryption keys', () => {
    expect(() => loadConfig({ AUTH_ENCRYPTION_KEY: 'bad' })).toThrow(/32-byte hex required/i);
  });

  it('rejects enabled Telegram without token', () => {
    expect(() => loadConfig({ AUTH_ENCRYPTION_KEY: key, TELE_ENABLED: 'true' })).toThrow(
      /TELEGRAM_BOT_TOKEN/i,
    );
  });

  it('reports owner warning candidates without throwing', () => {
    const config = loadConfig({
      AUTH_ENCRYPTION_KEY: key,
      TELE_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'token',
    });

    expect(getConfigWarnings(config)).toEqual([
      'WA_ENABLED=true but OWNER_WA is missing; WA owner commands will be disabled.',
      'TELE_ENABLED=true but OWNER_TG is missing; Telegram owner commands will be disabled.',
    ]);
  });
});
