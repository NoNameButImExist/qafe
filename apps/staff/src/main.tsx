import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { applyTheme } from '@qafe/ui';
import './i18n';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { router } from './router';
import './styles/index.css';

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
