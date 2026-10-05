import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { applyStoredBrand, applyTheme, syncPlatformBrand } from '@qafe/ui';
import { router } from './router';
import './styles/index.css';

applyTheme();
// Platform colour theme: the last known one at once, then the admin's current choice.
applyStoredBrand();
syncPlatformBrand(
  `${(import.meta.env.VITE_API_URL as string | undefined) ?? '/api'}/platform/theme`,
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Do not retry client errors (401, 403, 404…); retry network and server errors twice.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
