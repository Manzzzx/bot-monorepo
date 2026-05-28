import type { Platform } from '@bot/contracts';

/**
 * Match a user identifier against the configured owner id.
 *
 * - Telegram: numeric chat ids — only exact match counts.
 * - WhatsApp: Baileys returns JIDs that may carry a device suffix
 *   ('LOCAL:N@DOMAIN'). Treat 'LOCAL@DOMAIN', 'LOCAL:0@DOMAIN' and
 *   'LOCAL' as the same identity.
 *
 * The owner side is normalised the same way so the operator can configure
 * either the bare local part, the canonical JID, or whatever Baileys
 * happened to log; all collapse to one canonical key.
 */
export function isOwnerMatch(
  platform: Platform,
  userId: string | undefined | null,
  ownerId: string | undefined | null,
): boolean {
  if (!userId || !ownerId) return false;
  if (platform !== 'wa') return userId === ownerId;
  const lhs = canonicalWaId(userId);
  const rhs = canonicalWaId(ownerId);
  if (lhs === rhs) return true;
  // Local-only on one side, domain-qualified on the other still resolve to
  // the same identity (Baileys logs JIDs, operators sometimes paste digits).
  return localOf(lhs) === localOf(rhs);
}

function localOf(value: string): string {
  const at = value.indexOf('@');
  return at === -1 ? value : value.slice(0, at);
}

/**
 * Reduce a Baileys-style JID to its identity-bearing parts:
 *   - drop ':N' device suffix from the local segment
 *   - keep the '@DOMAIN' if present, otherwise return just the local part
 */
export function canonicalWaId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const at = trimmed.indexOf('@');
  const local = at === -1 ? trimmed : trimmed.slice(0, at);
  const domain = at === -1 ? '' : trimmed.slice(at);
  const colon = local.indexOf(':');
  const localOnly = colon === -1 ? local : local.slice(0, colon);
  return domain ? `${localOnly}${domain}` : localOnly;
}
