import type { StaffMe, StaffSession } from '@qafe/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshFailedOffline, refreshSession, session } from './api';
import { onNetworkChange } from './network';
import { setPinSession } from './device';
import { clearOfflineData } from './offline';
import { AuthContext, type AuthState } from './authContext';
import { unsubscribePush } from './push';
import { disconnectRealtime } from './realtime';
import { setReadyConfirmed } from './sound';

/** The signed-in member, so a reload without internet can still show the last state. */
const PROFILE_KEY = 'qafe.staff.profile';

function saveProfile(user: StaffMe | null) {
  try {
    if (user) localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Storage blocked: offline start is not possible, everything else works.
  }
}

function savedProfile(): StaffMe | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StaffMe) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const queryClient = useQueryClient();

  useEffect(() => {
    session.onExpired(() => {
      saveProfile(null);
      setState({ status: 'anonymous' });
    });
    // A page reload keeps the session through the refresh cookie.
    void refreshSession().then((s) => {
      if (s) {
        saveProfile(s.user);
        setState({ status: 'authenticated', user: s.user });
        return;
      }
      // No internet (NFR-05): stay in with the saved profile and the last snapshot; the
      // session is refreshed as soon as the API answers.
      const profile = refreshFailedOffline() ? savedProfile() : null;
      if (!profile) {
        setState({ status: 'anonymous' });
        return;
      }
      setState({ status: 'authenticated', user: profile });
      const retry = () =>
        void refreshSession().then((again) => {
          if (again) {
            stop();
            clearInterval(timer);
            saveProfile(again.user);
            setState({ status: 'authenticated', user: again.user });
          } else if (!refreshFailedOffline()) {
            stop();
            clearInterval(timer);
            saveProfile(null);
            setState({ status: 'anonymous' });
          }
        });
      const stop = onNetworkChange(retry);
      const timer = setInterval(retry, 5_000);
    });
  }, []);

  const login = useCallback(async (venueSlug: string, username: string, password: string) => {
    const result = await api<StaffSession>('/auth/staff/login', {
      method: 'POST',
      body: { venueSlug, username, password },
    });
    session.set(result.accessToken);
    saveProfile(result.user);
    setPinSession(false);
    // A new sign-in asks "Spreman za rad" again.
    setReadyConfirmed(false);
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const pinLogin = useCallback(async (memberId: string, pin: string) => {
    const result = await api<StaffSession>('/auth/staff/pin-login', {
      method: 'POST',
      body: { memberId, pin },
    });
    session.set(result.accessToken);
    saveProfile(result.user);
    setPinSession(true);
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
      if (state.status === 'authenticated') clearOfflineData(state.user.venue.id);
      saveProfile(null);
      setPinSession(false);
      session.clear();
      queryClient.clear();
      setState({ status: 'anonymous' });
    }
  }, [queryClient, state]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api<void>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
    const refreshed = await refreshSession();
    if (refreshed) setState({ status: 'authenticated', user: refreshed.user });
  }, []);

  const value = useMemo(
    () => ({ state, login, pinLogin, logout, changePassword }),
    [state, login, pinLogin, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
