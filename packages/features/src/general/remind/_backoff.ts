const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;
const JITTER_RATIO = 0.1;

/**
 * Exponential backoff (1m → 30m cap) with ±10% jitter to decorrelate retries
 * when many reminders fire against an adapter that just went down. Without
 * jitter, every retry pulses on the same minute boundary and pegs the
 * scheduler tick.
 */
export function backoffWithJitterMs(
  attempt: number,
  options: { random?: () => number } = {},
): number {
  const random = options.random ?? Math.random;
  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  const drift = base * JITTER_RATIO * (random() * 2 - 1);
  return Math.round(base + drift);
}

export const RETRY_CAP_MS = RETRY_MAX_MS;
