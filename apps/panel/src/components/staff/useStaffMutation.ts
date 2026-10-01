import type { VenueStaff } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { staffQuery } from '../../lib/queries';

/** Every staff change returns the whole list; it replaces the cached one. */
export function useStaffMutation<V>(
  fn: (vars: V) => Promise<VenueStaff>,
  onError?: (error: unknown) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (staff) => queryClient.setQueryData(staffQuery.queryKey, staff),
    onError,
  });
}
