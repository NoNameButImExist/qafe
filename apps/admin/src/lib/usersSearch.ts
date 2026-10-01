import type { UserKind } from '@qafe/contracts';

export interface UsersSearch {
  q?: string;
  kind?: UserKind;
  status?: 'active' | 'blocked';
  page?: number;
}

export function validateUsersSearch(search: Record<string, unknown>): UsersSearch {
  const page = Number(search.page);
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    kind: search.kind === 'platform' || search.kind === 'staff' ? search.kind : undefined,
    status: search.status === 'active' || search.status === 'blocked' ? search.status : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}
