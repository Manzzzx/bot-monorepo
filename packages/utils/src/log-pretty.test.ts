import { describe, expect, it } from 'vitest';
import { formatTime, maskId, renderLine } from './log-pretty.js';

const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('formatTime', () => {
  it('formats epoch ms with HH:mm:ss.SSS', () => {
    const out = formatTime(Date.UTC(2026, 4, 27, 0, 30, 5, 123), 'UTC');
    expect(out).toBe('00:30:05.123');
  });
});

describe('maskId', () => {
  it('masks WA private JID', () => {
    expect(maskId('6289650388933@s.whatsapp.net', 'wa', false)).toBe('6289****8933');
  });
  it('masks WA group JID with grp prefix', () => {
    expect(maskId('120363021987654321@g.us', 'wa', false)).toBe('grp:1203****');
  });
  it('keeps Telegram username intact', () => {
    expect(maskId('@Mannn678', 'tele', false)).toBe('@Mannn678');
  });
  it('masks Telegram numeric chat ID with sign', () => {
    expect(maskId('-1001234567890', 'tele', false)).toBe('-100****890');
  });
  it('returns full id when logPii=true', () => {
    expect(maskId('6289650388933@s.whatsapp.net', 'wa', true)).toBe('6289650388933@s.whatsapp.net');
  });
});

describe('renderLine', () => {
  const render = (log: Record<string, unknown>, color = false): string =>
    stripAnsi(renderLine(log, { color, logPii: false, tz: 'UTC' }));

  it('renders private chat line with masked WA id', () => {
    const out = render({
      time: Date.UTC(2026, 4, 27, 0, 42, 35, 935),
      level: 30,
      status: 'ok',
      platform: 'wa',
      chatType: 'private',
      userId: '6289650388933@s.whatsapp.net',
      userName: 'Manzz',
      commandName: 'ping',
      durationMs: 121,
      msg: 'handled',
    });

    expect(out).toContain('00:42:35.935');
    expect(out).toContain('OK');
    expect(out).toContain('wa');
    expect(out).toContain('PC');
    expect(out).toContain('Manzz · 6289****8933');
    expect(out).toContain('/ping');
    expect(out).toContain('handled');
    expect(out).toContain('121ms');
    expect(out).not.toMatch(/\n/);
  });

  it('renders group chat line with chatName › sender', () => {
    const out = render({
      time: Date.UTC(2026, 4, 27, 0, 44, 30, 0),
      level: 30,
      status: 'ok',
      platform: 'wa',
      chatType: 'group',
      chatName: 'Sat Set Meet',
      userId: '6289650388933@s.whatsapp.net',
      commandName: 'everyone',
      msg: 'tagged 12 members',
    });

    expect(out).toContain('GC');
    expect(out).toContain('Sat Set Meet › 6289****8933');
    expect(out).toContain('tagged 12 members');
  });

  it('renders system event with placeholders', () => {
    const out = render({
      time: Date.UTC(2026, 4, 27, 0, 52, 0, 0),
      level: 30,
      status: 'ok',
      bootMs: 224,
      msg: 'Bot bootstrap complete',
    });

    expect(out).toContain('—');
    expect(out).toContain('system');
    expect(out).toContain('Bot bootstrap complete');
    expect(out).toContain('224ms');
  });

  it('renders error with status WARN and trailing stack lines', () => {
    const out = render({
      time: Date.UTC(2026, 4, 27, 0, 45, 11, 882),
      level: 50,
      status: 'error',
      platform: 'tele',
      chatType: 'group',
      chatName: 'Bot Test',
      userId: '@Mannn678',
      feature: 'general/stats',
      err: {
        type: 'TypeError',
        message: "Cannot read 'count' of undefined",
        stack:
          "TypeError: Cannot read 'count' of undefined\n    at handler (stats.ts:42:18)\n    at router (router.ts:88:5)",
      },
      msg: 'Unhandled bot error',
    });

    expect(out).toContain('ERROR');
    expect(out).toContain('tg');
    expect(out).toContain('Bot Test › @Mannn678');
    expect(out).toContain('TypeError');
    expect(out).toContain('╰─ at handler (stats.ts:42:18)');
    expect(out).toContain('╰─ at router (router.ts:88:5)');
  });

  it('respects logPii=true to keep raw ids', () => {
    const out = stripAnsi(
      renderLine(
        {
          time: 0,
          level: 30,
          status: 'ok',
          platform: 'wa',
          chatType: 'private',
          userId: '6289650388933@s.whatsapp.net',
          userName: 'Manzz',
          msg: 'hi',
        },
        { color: false, logPii: true, tz: 'UTC' },
      ),
    );
    expect(out).toContain('6289650388933');
  });

  it('emits ANSI codes when color=true', () => {
    const out = renderLine(
      {
        time: 0,
        level: 30,
        status: 'ok',
        msg: 'hi',
      },
      { color: true, logPii: false, tz: 'UTC' },
    );
    expect(out).toMatch(/\u001b\[/);
  });
});