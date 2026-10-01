import type { VenueSpace } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spaceQuery } from '../../lib/queries';

/** Every space change returns all areas and tables; they replace the cached ones. */
export function useSpaceMutation<V>(
  fn: (vars: V) => Promise<VenueSpace>,
  onError?: (error: unknown) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (space) => queryClient.setQueryData(spaceQuery.queryKey, space),
    onError,
  });
}
