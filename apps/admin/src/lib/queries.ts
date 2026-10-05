import type {
  AdminStats,
  AdminUserList,
  AdminUserListParams,
  AuditFacets,
  AuditList,
  AuditParams,
  MonitoringOverview,
  SmtpSettings,
  MonitoringWindow,
  PlatformModule,
  VenueDetail,
  VenueList,
  VenueListParams,
} from '@qafe/contracts';
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const adminStatsQuery = queryOptions({
  queryKey: ['admin', 'stats'],
  queryFn: () => api<AdminStats>('/admin/stats'),
});

export const venuesQuery = (params: VenueListParams) =>
  queryOptions({
    queryKey: ['admin', 'venues', 'list', params],
    queryFn: () => api<VenueList>('/admin/venues', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });

export const citiesQuery = queryOptions({
  queryKey: ['admin', 'venues', 'cities'],
  queryFn: () => api<string[]>('/admin/venues/cities'),
});

export const venueQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'venues', 'detail', id],
    queryFn: () => api<VenueDetail>(`/admin/venues/${id}`),
  });

export const modulesQuery = queryOptions({
  queryKey: ['admin', 'modules'],
  queryFn: () => api<PlatformModule[]>('/admin/modules'),
});

export const usersQuery = (params: AdminUserListParams) =>
  queryOptions({
    queryKey: ['admin', 'users', params],
    queryFn: () => api<AdminUserList>('/admin/users', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });

/** Newest entries first; "Učitaj još" fetches the next older page by cursor. */
export const auditQuery = (params: Omit<AuditParams, 'cursor'>) =>
  infiniteQueryOptions({
    queryKey: ['admin', 'audit', params],
    queryFn: ({ pageParam }) =>
      api<AuditList>('/admin/audit', {
        query: { ...params, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });

export const auditFacetsQuery = queryOptions({
  queryKey: ['admin', 'audit', 'facets'],
  queryFn: () => api<AuditFacets>('/admin/audit/facets'),
});

/** FR-ADM-17, FR-ADM-18: refreshed every 30 s while the screen is open. */
export const monitoringQuery = (window: MonitoringWindow) =>
  queryOptions({
    queryKey: ['admin', 'monitoring', window],
    queryFn: () => api<MonitoringOverview>('/admin/monitoring', { query: { window } }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

/** SMTP settings of the platform (the password itself never comes back). */
export const smtpQuery = queryOptions({
  queryKey: ['admin', 'settings', 'smtp'],
  queryFn: () => api<SmtpSettings>('/admin/settings/smtp'),
});
