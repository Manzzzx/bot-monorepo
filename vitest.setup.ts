// Pin process.env.TZ for every vitest run so date/time-based assertions
// don't drift between local machines and CI runners.
process.env.TZ = process.env.TZ ?? 'UTC';
