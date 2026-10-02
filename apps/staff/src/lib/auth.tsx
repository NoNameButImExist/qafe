import type { StaffSession } from '@qafe/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, session } from './api';
import { AuthContext, type AuthState } from './authContext';
import { unsubscribePush } from './push';
import { disconnectRealtime } from './realtime';
import { setReadyConfirmed } from './sound';

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
    // A new sign-in asks "Spreman za rad" again.
    setReadyConfirmed(false);
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      // A shared phone must not keep notifying the member who signed out.
      await unsubscribePush().catch(() => undefined);
      await api<void>('/auth/staff/logout', { method: 'POST' });
    } finally {
      disconnectRealtime();
      setReadyConfirmed(false);
      session.clear();
      queryClient.clear();
      setState({ status: 'anonymous' });
    }
  }, [queryClient]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api<void>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
    const refreshed = await refreshSession();
    if (refreshed) setState({ status: 'authenticated', user: refreshed.user });
  }, []);

  const value = useMemo(
    () => ({ state, login, logout, changePassword }),
    [state, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
