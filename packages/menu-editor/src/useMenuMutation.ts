import type { Menu } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMenuEditor } from './context';

/** Every catalog change returns the whole menu; it replaces the cached one. */
export function useMenuMutation<V>(
  fn: (vars: V) => Promise<Menu>,
  onError?: (error: unknown) => void,
) {
  const queryClient = useQueryClient();
  const { queryKey } = useMenuEditor();
  return useMutation({
    mutationFn: fn,
    onSuccess: (menu) => queryClient.setQueryData(queryKey, menu),
    onError,
  });
}
