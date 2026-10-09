import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { CloudApiClient } from './lib/api-client';
import './styles.css';
import './stitch-redesign.css';
import './ux-system.css';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><App apiClient={CloudApiClient} /></QueryClientProvider>
  </StrictMode>,
);
