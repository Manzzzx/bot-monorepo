import { describe, expect, it } from 'vitest';
import { getConfigWarnings, loadConfig } from './config.js';

const key = 'a'.repeat(64);

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig({ AUTH_ENCRYPTION_KEY: key, TELEGRAM_BOT_TOKEN: 'token' });

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      TZ: 'Asia/Jakarta',
      LOG_LEVEL: 'info',
      LOG_DIR: './data/log',
      LOG_NO_COLOR: false,
      LOG_PII: false,
      DATABASE_URL: 'file:./data/bot.db',
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
      'COVENANT_API_KEY missing; covenant provider disabled, downloader/stalker fallback unavailable.',
    ]);
  });


  it('accepts custom IANA timezone', () => {
    const config = loadConfig({
      AUTH_ENCRYPTION_KEY: key,
      TELEGRAM_BOT_TOKEN: 'token',
      TZ: 'Asia/Singapore',
    });
    expect(config.TZ).toBe('Asia/Singapore');
  });

  it('rejects invalid IANA timezone', () => {
    expect(() =>
      loadConfig({ AUTH_ENCRYPTION_KEY: key, TELEGRAM_BOT_TOKEN: 'token', TZ: 'Asai/Jakarta' }),
    ).toThrow(/Invalid IANA timezone/i);
  });

  it('falls back to Asia/Jakarta when TZ is unset', () => {
    const config = loadConfig({ AUTH_ENCRYPTION_KEY: key, TELEGRAM_BOT_TOKEN: 'token' });
    expect(config.TZ).toBe('Asia/Jakarta');
  });
});
