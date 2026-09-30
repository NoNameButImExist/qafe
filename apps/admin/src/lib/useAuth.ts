import type { Me } from '@qafe/contracts';
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in admin (use inside the protected layout). */
export function useUser(): Me {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('Not authenticated');
  return state.user;
}
