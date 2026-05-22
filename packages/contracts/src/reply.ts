import type { MediaRef, MessageCtx, ReplyButton, ReplyMedia, ReplyOpts } from './message-ctx.js';

export interface ReplyHelperOptions {
  buttons?: ReplyButton[][] | undefined;
  quote?: boolean | undefined;
  mentions?: string[] | undefined;
  media?: MediaRef | ReplyMedia | undefined;
  /**
   * Append a "⬅ Kembali" row pointing to this command. Default `'menu'`.
   * Pass `false` to skip (use for root screens like start/menu/stats).
   */
  backTo?: string | false | undefined;
}

const DEFAULT_BACK_COMMAND = 'menu';
const BACK_LABEL = '⬅ Kembali';

/**
 * Send a reply. Skips opts when nothing is set, strips `buttons` on platforms
 * that don't support them, and auto-appends a `⬅ Kembali` row when supported
 * (unless `backTo: false`).
 */
export async function reply(
  ctx: MessageCtx,
  text: string,
  options?: ReplyHelperOptions,
): Promise<void> {
  const opts: ReplyOpts = {};

  if (ctx.capabilities.buttons) {
    const base = options?.buttons ?? [];
    const backTo = options?.backTo;
    const rows: ReplyButton[][] = base.length > 0 ? [...base] : [];
    if (backTo !== false) {
      rows.push([{ label: BACK_LABEL, command: backTo ?? DEFAULT_BACK_COMMAND }]);
    }
    if (rows.length > 0) opts.buttons = rows;
  }

  if (options?.quote !== undefined) opts.quote = options.quote;
  if (options?.mentions !== undefined) opts.mentions = options.mentions;
  if (options?.media !== undefined) opts.media = options.media;

  if (Object.keys(opts).length === 0) {
    await ctx.reply(text);
    return;
  }
  await ctx.reply(text, opts);
}