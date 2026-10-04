export interface AuditSearch {
  action?: string;
  venueId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function validateAuditSearch(search: Record<string, unknown>): AuditSearch {
  const str = (v: unknown, re?: RegExp) =>
    typeof v === 'string' && v && (!re || re.test(v)) ? v : undefined;
  return {
    action: str(search.action),
    venueId: str(search.venueId, UUID),
    actorId: str(search.actorId, UUID),
    from: str(search.from, DAY),
    to: str(search.to, DAY),
  };
}
