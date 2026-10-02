import type { Me } from '@qafe/contracts';
import { createContext } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: Me };

export interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Own password (FR-SEF-01); the session is refreshed so the token drops the flag. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
