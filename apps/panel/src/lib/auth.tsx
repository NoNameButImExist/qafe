import type { StaffSession } from '@qafe/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, session } from './api';
import { AuthContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  useEffect(() => {
    session.onExpired(() => setState({ status: 'anonymous' }));
    // A page reload keeps the session through the refresh cookie.
    void refreshSession().then((s) =>
      setState(s ? { status: 'authenticated', user: s.user } : { status: 'anonymous' }),
    );
  }, []);

  const login = useCallback(async (venueSlug: string, username: string, password: string) => {
    const result = await api<StaffSession>('/auth/staff/login', {
      method: 'POST',
      body: { venueSlug, username, password },
    });
    session.set(result.accessToken);
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<void>('/auth/staff/logout', { method: 'POST' });
    } finally {
      session.clear();
      queryClient.clear();
      setState({ status: 'anonymous' });
    }
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
