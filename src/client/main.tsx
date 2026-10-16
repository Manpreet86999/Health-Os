import { androidLayout } from './lib/android-layout';
import { androidProductThemes } from './lib/android-product-themes';
import { initializeNativeAndroid } from './lib/android-native';
import { productThemes } from '../shared/product-design';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useCanonicalOrigin } from './lib/canonical-origin';

import App from './App';
import { initializeMobileInteractions } from './lib/mobile-interactions';
import { CloudApiClient } from './lib/api-client';
import './styles.css';
import './biology.css';
import './flow.css';
import './overview.css';
import './health-design.css';
import './web-alignment.css';
import './visual-experience.css';
import './stitch-redesign.css';
import './readiness-layout.css';
import './ux-system.css';

const paletteStyle = document.createElement('style');
paletteStyle.id = 'health-os-theme-tokens';
paletteStyle.textContent = Object.entries(androidLayout?androidProductThemes:productThemes).map(([theme,colors]) =>
  `body${theme === 'dark' ? '.dark' : ':not(.dark)'}{${Object.entries(colors).map(([role,value])=>`--hos-${role}:${value}`).join(';')}}`
).join('\n');
document.head.append(paletteStyle);
initializeMobileInteractions();
if(androidLayout)void initializeNativeAndroid();

if ('serviceWorker' in navigator && import.meta.env.PROD && !androidLayout) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}

void useCanonicalOrigin().then(redirecting => { if (redirecting) return;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><App apiClient={CloudApiClient} /></QueryClientProvider>
  </StrictMode>,
);
});

import './web-unified.css';
import './android-organized.css';
import './health-os-premium.css';
