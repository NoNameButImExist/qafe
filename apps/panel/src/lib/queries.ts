import type { Menu, VenueSettings, VenueSpace, VenueStaff } from '@qafe/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const menuQuery = queryOptions({
  queryKey: ['menu'],
  queryFn: () => api<Menu>('/catalog/menu'),
});

export const settingsQuery = queryOptions({
  queryKey: ['venue'],
  queryFn: () => api<VenueSettings>('/venue'),
});

export const spaceQuery = queryOptions({
  queryKey: ['space'],
  queryFn: () => api<VenueSpace>('/venue/tables'),
});

export const staffQuery = queryOptions({
  queryKey: ['staff'],
  queryFn: () => api<VenueStaff>('/venue/staff'),
});
