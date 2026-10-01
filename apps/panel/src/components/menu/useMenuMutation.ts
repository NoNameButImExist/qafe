import type { Menu } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { menuQuery } from '../../lib/queries';

/** Every catalog change returns the whole menu; it replaces the cached one. */
export function useMenuMutation<V>(
  fn: (vars: V) => Promise<Menu>,
  onError?: (error: unknown) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (menu) => queryClient.setQueryData(menuQuery.queryKey, menu),
    onError,
  });
}
