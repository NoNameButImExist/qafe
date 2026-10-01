import type { AccessClaims } from './tokens.js';

/** Permission check, e.g. can(user, 'orders.cancel'). Codes come from core.permissions. */
export function can(claims: AccessClaims, permission: string): boolean {
  if (claims.kind === 'platform') {
    // Support is read-only (FR-ADM-12, V2); for now only super admins act on venues.
    return claims.role === 'super_admin';
  }
  return claims.permissions.includes(permission);
}
