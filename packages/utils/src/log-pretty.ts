import { Transform } from 'node:stream';

const RESET = '\u001b[0m';
const C = {
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  redBold: '\u001b[1;31m',
  bgRedBold: '\u001b[41;97;1m',
  greenBold: '\u001b[1;32m',
  yellowBold: '\u001b[1;33m',
  cyanBold: '\u001b[1;36m',
};

interface StatusStyle {
  label: string;
  color: string;
}

const STATUS_DISPLAY: Record<string, StatusStyle> = {
  ok: { label: 'OK   ', color: C.greenBold },
  rejected: { label: 'WARN ', color: C.yellowBold },
  error: { label: 'ERROR', color: C.redBold },
  fatal: { label: 'FATAL', color: C.bgRedBold },
};

const LEVEL_FALLBACK_STATUS: Record<number, string> = {
  10: 'ok',
  20: 'ok',
  30: 'ok',
  40: 'rejected',
  50: 'error',
  60: 'fatal',
};

const COL_TIME = 12;
const COL_STATUS = 5;
const COL_PLAT = 2;
const COL_TYPE = 2;
const COL_WHO = 32;
const COL_CMD = 18;

const STACK_INDENT = ' '.repeat(
  COL_TIME + 2 + COL_STATUS + 2 + COL_PLAT + 2 + COL_TYPE + 2 + COL_WHO + 2 + COL_CMD + 1,
);

export interface RenderOpts {
  logPii: boolean;
  color: boolean;
  tz?: string | undefined;
}

function paint(s: string, code: string, on: boolean): string {
  return on ? `${code}${s}${RESET}` : s;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return s.slice(0, n - 1) + '…';
}

export function formatTime(epochMs: number, tz?: string): string {
  const date = new Date(epochMs);
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  if (tz) opts.timeZone = tz;
  let hms: string;
  try {
    hms = new Intl.DateTimeFormat('en-GB', opts).format(date);
  } catch {
    hms = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(date);
  }
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hms}.${ms}`;
}

export function maskId(id: string, platform: string | undefined, logPii: boolean): string {
  if (!id) return '';
  if (logPii) return id;
  if (platform === 'wa') {
    const at = id.indexOf('@');
    const num = at > 0 ? id.slice(0, at) : id;
    if (id.endsWith('@g.us')) {
      return `grp:${num.slice(0, 4)}****`;
    }
    if (num.length <= 8) return `${num.slice(0, 4)}****`;
    return `${num.slice(0, 4)}****${num.slice(-4)}`;
  }
  if (platform === 'tele' || platform === 'tg') {
    if (id.startsWith('@')) return id;
    const sign = id.startsWith('-') ? '-' : '';
    const digits = id.replace(/[^0-9]/g, '');
    if (digits.length <= 6) return `${sign}${digits.slice(0, 2)}****`;
    return `${sign}${digits.slice(0, 3)}****${digits.slice(-3)}`;
  }
  return id;
}

function platformAbbr(platform: string | undefined): string {
  if (platform === 'wa') return 'wa';
  if (platform === 'tele') return 'tg';
  return '—';
}

function chatTypeAbbr(chatType: string | undefined, isGroup?: unknown): string {
  if (chatType === 'private') return 'PC';
  if (chatType === 'group') return 'GC';
  if (isGroup === true) return 'GC';
  if (isGroup === false) return 'PC';
  return '—';
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildWho(log: Record<string, unknown>, opts: RenderOpts): string {
  const platform = pickString(log.platform) || undefined;
  const chatType = pickString(log.chatType) || undefined;
  const userId = pickString(log.userId);
  const chatId = pickString(log.chatId);
  const userName = pickString(log.userName);
  const chatName = pickString(log.chatName);
  const component = pickString(log.component);
  const feature = pickString(log.feature);

  const isGroup =
    chatType === 'group' || (typeof log.isGroup === 'boolean' && log.isGroup) || undefined;

  if (!platform && !userId && !chatId) {
    if (component) return truncate(component, COL_WHO);
    if (feature) return truncate(feature, COL_WHO);
    return 'system';
  }

  if (!userId && !chatId && component) {
    return truncate(component, COL_WHO);
  }

  if (isGroup) {
    const name = chatName ? truncate(chatName, 14) : 'Group';
    const sender = userId ? maskId(userId, platform, opts.logPii) : '—';
    const senderName = userName ? truncate(userName, 8) : '';
    const senderPart = senderName ? `${senderName}·${sender}` : sender;
    return truncate(`${name} › ${senderPart}`, COL_WHO);
  }

  const name = userName ? truncate(userName, 12) : '';
  const id = userId ? maskId(userId, platform, opts.logPii) : '';
  if (name && id) return truncate(`${name} · ${id}`, COL_WHO);
  if (name) return truncate(name, COL_WHO);
  if (id) return truncate(id, COL_WHO);
  if (component) return truncate(component, COL_WHO);
  return '—';
}

function buildCommand(log: Record<string, unknown>): string {
  const commandName = pickString(log.commandName);
  if (commandName) {
    const args = Array.isArray(log.args) ? (log.args as unknown[]).map(String) : [];
    const argsStr = args.length ? ' ' + args.join(' ') : '';
    return truncate(`/${commandName}${argsStr}`, COL_CMD);
  }
  const action = pickString(log.action);
  if (action) return truncate(action, COL_CMD);
  const feature = pickString(log.feature);
  if (feature) {
    const tail = feature.includes('/') ? feature.split('/').pop()! : feature;
    return truncate(tail, COL_CMD);
  }
  return '—';
}

function buildExtras(log: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof log.durationMs === 'number') parts.push(`${log.durationMs}ms`);
  if (typeof log.bootMs === 'number') parts.push(`${log.bootMs}ms`);
  if (typeof log.attempt === 'number') parts.push(`attempt ${log.attempt}`);
  if (typeof log.backoffMs === 'number') parts.push(`backoff ${log.backoffMs}ms`);
  if (typeof log.exitCode === 'number') parts.push(`code=${log.exitCode}`);
  if (typeof log.signal === 'string') parts.push(log.signal);
  if (typeof log.claimed === 'number') parts.push(`${log.claimed} due`);
  if (typeof log.retryAfterMs === 'number') parts.push(`retry ${log.retryAfterMs}ms`);
  return parts.join(' · ');
}

function buildErrLines(err: unknown, color: boolean): string {
  if (!err || typeof err !== 'object') return '';
  const stack = pickString((err as { stack?: unknown }).stack);
  if (!stack) return '';
  const lines = stack.split('\n').slice(1, 4).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  return lines
    .map((line) => '\n' + STACK_INDENT + paint('╰─ ' + line, C.dim, color))
    .join('');
}

function errMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const rawType = pickString((err as { type?: unknown }).type);
  const type = rawType && rawType !== 'Object' ? rawType : '';
  const message = pickString((err as { message?: unknown }).message);
  if (type && message) return `${type}: ${message}`;
  return type || message || '';
}

export function renderLine(log: Record<string, unknown>, opts: RenderOpts): string {
  const epochMs = typeof log.time === 'number' ? log.time : Date.now();
  const time = formatTime(epochMs, opts.tz);
  const level = typeof log.level === 'number' ? log.level : 30;
  const status = pickString(log.status) || LEVEL_FALLBACK_STATUS[level] || 'ok';
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.ok!;
  const statusPart = paint(pad(display.label, COL_STATUS), display.color, opts.color);

  const platform = pickString(log.platform) || undefined;
  const chatType = pickString(log.chatType) || undefined;
  const platPart = paint(pad(platformAbbr(platform), COL_PLAT), C.cyan, opts.color);
  const typePart = paint(pad(chatTypeAbbr(chatType, log.isGroup), COL_TYPE), C.magenta, opts.color);
  const whoPart = pad(buildWho(log, opts), COL_WHO);
  const cmdPart = paint(pad(buildCommand(log), COL_CMD), C.cyanBold, opts.color);

  const baseMsg = pickString(log.msg);
  const errMsg = errMessage(log.err);
  const msg = errMsg ? (baseMsg && baseMsg !== errMsg ? `${baseMsg} · ${errMsg}` : errMsg) : baseMsg;
  const extras = buildExtras(log);
  const msgFull = extras ? (msg ? `${msg} · ${extras}` : extras) : msg;

  const errLines = buildErrLines(log.err, opts.color);

  const timePart = paint(pad(time, COL_TIME), C.dim, opts.color);
  const sep = paint('│', C.dim, opts.color);

  return `${timePart}  ${statusPart}  ${platPart}  ${typePart}  ${whoPart}  ${cmdPart} ${sep} ${msgFull}${errLines}`;
}

export function createPrettyStream(opts: RenderOpts): Transform {
  let buffer = '';
  return new Transform({
    writableObjectMode: false,
    transform(chunk: Buffer | string, _enc, cb) {
      try {
        buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const out: string[] = [];
        for (const line of lines) {
          if (!line) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(line) as Record<string, unknown>;
          } catch {
            out.push(line);
            continue;
          }
          out.push(renderLine(parsed, opts));
        }
        cb(null, out.length ? out.join('\n') + '\n' : '');
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      if (!buffer) return cb();
      try {
        const parsed = JSON.parse(buffer) as Record<string, unknown>;
        cb(null, renderLine(parsed, opts) + '\n');
      } catch {
        cb(null, buffer + '\n');
      }
    },
  });
}