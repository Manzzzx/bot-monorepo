const unitMs = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseDuration(input: string): number {
  const duration = input.trim();
  if (!duration) {
    throw new Error('Duration cannot be empty');
  }

  const tokenPattern = /(\d+)([smhd])/g;
  let totalMs = 0;
  let consumed = '';

  for (const match of duration.matchAll(tokenPattern)) {
    const [, amountRaw, unit] = match;
    if (!amountRaw || !unit) {
      throw new Error(`Invalid duration: ${input}`);
    }

    consumed += match[0];
    totalMs += Number(amountRaw) * unitMs[unit as keyof typeof unitMs];
  }

  if (consumed !== duration || totalMs <= 0) {
    throw new Error(`Invalid duration: ${input}`);
  }

  return totalMs;
}
