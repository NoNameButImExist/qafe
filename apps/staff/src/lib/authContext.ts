import type { StaffMe } from '@qafe/contracts';
import { createContext } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: StaffMe };

export interface AuthContextValue {
  state: AuthState;
  login: (venueSlug: string, username: string, password: string) => Promise<void>;
  /** PIN on a shared device linked to the venue (FR-KON-01). */
  pinLogin: (memberId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Own password (FR-SEF-01); the session is refreshed so the token drops the flag. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
