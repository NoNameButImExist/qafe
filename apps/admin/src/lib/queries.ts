import type {
  AdminStats,
  AdminUserList,
  AdminUserListParams,
  AuditFacets,
  AuditList,
  AuditParams,
  PlatformModule,
  VenueDetail,
  VenueList,
  VenueListParams,
} from '@qafe/contracts';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
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

export const auditQuery = (params: AuditParams) =>
  queryOptions({
    queryKey: ['admin', 'audit', params],
    queryFn: () => api<AuditList>('/admin/audit', { query: { ...params } }),
    placeholderData: keepPreviousData,
  });

export const auditFacetsQuery = queryOptions({
  queryKey: ['admin', 'audit', 'facets'],
  queryFn: () => api<AuditFacets>('/admin/audit/facets'),
});
