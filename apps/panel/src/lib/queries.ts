import type { Menu, VenueSettings } from '@qafe/contracts';
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
