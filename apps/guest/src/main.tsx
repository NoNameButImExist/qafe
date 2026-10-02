import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '@qafe/ui';
import { App } from './App';
import './i18n';
import { ApiError } from './lib/api';
import { connectRealtime } from './lib/realtime';
import { Bursts } from './motion/Bursts';
import { MotionRoot } from './motion/MotionRoot';
import './styles.css';

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (404 venue, blocked device…) are answers, not glitches: no retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});
connectRealtime(queryClient);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionRoot>
        <App />
        <Bursts />
      </MotionRoot>
    </QueryClientProvider>
  </StrictMode>,
);
