import { createContext, useContext } from 'react';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A prep station for the KDS module (FR-SEF-12). */
export interface PrepStationOption {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * What the app gives the menu editor. The editor never knows which app it runs in: the panel
 * points `request` at /catalog (the member's own venue), the admin at
 * /admin/venues/<id>/catalog (FR-ADM-07).
 */
export interface MenuEditorConfig {
  /** Calls a catalog endpoint; `path` is relative to the catalog, e.g. "/items". */
  request: <T>(
    path: string,
    init?: { method?: RequestMethod; body?: unknown; form?: FormData },
  ) => Promise<T>;
  /** Cache key of this venue's menu in TanStack Query. */
  queryKey: readonly unknown[];
  /** Translated message for an API error (each app has its own error texts). */
  errorText: (error: unknown) => string;
  /** The venue's currency, e.g. "BAM". */
  currency: string;
  /** Change the menu (categories, items, modifiers). */
  canEdit: boolean;
  /** Mark items available or sold out (waiters with menu.availability may only do this). */
  canToggle: boolean;
  /** Prep stations when the KDS module is on; null hides the choice. */
  stations: PrepStationOption[] | null;
}

export const MenuEditorContext = createContext<MenuEditorConfig | null>(null);

export function useMenuEditor(): MenuEditorConfig {
  const config = useContext(MenuEditorContext);
  if (!config) throw new Error('useMenuEditor must be used inside <MenuEditor>');
  return config;
}
