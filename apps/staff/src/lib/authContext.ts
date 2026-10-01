import type { StaffMe } from '@qafe/contracts';
import { createContext } from 'react';

export type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: StaffMe };

export interface AuthContextValue {
  state: AuthState;
  login: (venueSlug: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
