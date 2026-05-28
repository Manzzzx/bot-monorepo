export type Platform = 'wa' | 'tele';

export interface PlatformCapabilities {
  buttons: boolean;
  list: boolean;
  edit: boolean;
  reactions: boolean;
}

const PLATFORM_VALUES: ReadonlySet<Platform> = new Set(['wa', 'tele']);

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && PLATFORM_VALUES.has(value as Platform);
}

/**
 * Coerce a string to a known platform. Returns `null` when unrecognised so
 * callers must explicitly decide on a default rather than silently aliasing.
 */
export function parsePlatform(value: unknown): Platform | null {
  return isPlatform(value) ? value : null;
}
