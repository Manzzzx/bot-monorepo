import type {
  MediaRef,
  MessageCtx,
  ParseMode,
  ReplyButton,
  ReplyMedia,
  ReplyOpts,
} from './message-ctx.js';

export interface ReplyHelperOptions {
  buttons?: ReplyButton[][] | undefined;
  quote?: boolean | undefined;
  mentions?: string[] | undefined;
  media?: MediaRef | ReplyMedia | undefined;
  parseMode?: ParseMode | undefined;
  /**
   * Append a "⬅ Kembali" row pointing to this command. Default `'menu'`.
   * Pass `false` to skip (use for root screens like start/menu/stats).
   */
  backTo?: string | false | undefined;
}

const DEFAULT_BACK_COMMAND = 'menu';
const BACK_LABEL = '⬅ Kembali';
const FALLBACK_HINT = 'Reply dengan nomor atau ketik commandnya:';

function flattenButtons(rows: ReplyButton[][]): ReplyButton[] {
  return rows.flatMap((row) => row);
}

function describeButton(button: ReplyButton, index: number): string {
  const label = button.label ?? '';
  if (button.command) {
    const cmd = button.command.startsWith('/') ? button.command : `/${button.command}`;
    return `${index + 1}. ${label} — ${cmd}`;
  }
  if (button.url) {
    return `${index + 1}. ${label} — ${button.url}`;
  }
  return `${index + 1}. ${label}`;
}

function buildButtonFallback(rows: ReplyButton[][]): string | null {
  const flat = flattenButtons(rows);
  if (flat.length === 0) return null;
  const lines = flat.map((btn, idx) => describeButton(btn, idx));
  return [`\n${FALLBACK_HINT}`, ...lines].join('\n');
}

/**
 * Send a reply. Skips opts when nothing is set, strips `buttons` on platforms
 * that don't support them, and auto-appends a `⬅ Kembali` row when supported
 * (unless `backTo: false`). Platforms without inline buttons receive the same
 * navigation as a numbered text fallback so the user can still see the menu.
 */
export async function reply(
  ctx: MessageCtx,
  text: string,
  options?: ReplyHelperOptions,
): Promise<void> {
  const opts: ReplyOpts = {};
  let outboundText = text;

  const baseRows = options?.buttons ?? [];
  const backTo = options?.backTo;

  if (ctx.capabilities.buttons) {
    const rows: ReplyButton[][] = baseRows.length > 0 ? [...baseRows] : [];
    if (backTo !== false) {
      rows.push([{ label: BACK_LABEL, command: backTo ?? DEFAULT_BACK_COMMAND }]);
    }
    if (rows.length > 0) opts.buttons = rows;
  } else if (baseRows.length > 0) {
    const fallback = buildButtonFallback(baseRows);
    if (fallback) outboundText = `${text}${fallback}`;
  }

  if (options?.quote !== undefined) opts.quote = options.quote;
  if (options?.mentions !== undefined) opts.mentions = options.mentions;
  if (options?.media !== undefined) opts.media = options.media;
  if (options?.parseMode !== undefined) opts.parseMode = options.parseMode;

  if (Object.keys(opts).length === 0) {
    await ctx.reply(outboundText);
    return;
  }
  await ctx.reply(outboundText, opts);
}
