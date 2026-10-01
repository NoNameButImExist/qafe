import type { StaffMe } from '@qafe/contracts';
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in staff member (use inside the protected layout). */
export function useStaff(): StaffMe {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('Not authenticated');
  return state.user;
}

/** Whether the signed-in member has any of the permissions (codes from core.permissions). */
export function useCan(...codes: string[]): boolean {
  const staff = useStaff();
  return codes.some((code) => staff.permissions.includes(code));
}
