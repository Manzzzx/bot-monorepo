import type { Logger } from 'pino';

interface TelegramApiError {
  error_code?: number;
  description?: string;
}

export function isMarkdownParseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as TelegramApiError;
  if (candidate.error_code !== 400) return false;
  if (typeof candidate.description !== 'string') return false;
  return /parse|entit/i.test(candidate.description);
}

/**
 * Attempt a Telegram send with `parse_mode` set; if Telegram rejects with a
 * markdown/HTML parse error, log and retry without `parse_mode` so the user
 * still receives the message (plain text).
 */
export async function sendWithMarkdownFallback(
  send: (opts: Record<string, unknown>) => Promise<unknown>,
  baseOpts: Record<string, unknown>,
  parseMode: string | undefined,
  logger: Logger,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    await send(baseOpts);
  } catch (error) {
    if (!parseMode || !isMarkdownParseError(error)) throw error;
    const description = (error as TelegramApiError).description;
    logger.warn(
      { ...context, status: 'recoverable', parseMode, description },
      'telegram markdown parse failed, retrying as plain text',
    );
    const fallback: Record<string, unknown> = { ...baseOpts };
    delete fallback.parse_mode;
    await send(fallback);
  }
}