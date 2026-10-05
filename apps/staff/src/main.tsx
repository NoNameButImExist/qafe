import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { applyStoredBrand, applyTheme, syncPlatformBrand } from '@qafe/ui';
import './i18n';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
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
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

// The service worker keeps the app shell for offline starts (NFR-05) and shows pushes.
// Not in dev: Vite serves unhashed modules that must never come from a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
