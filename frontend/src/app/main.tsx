import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { frontendBasePath } from './base-path';
import { GlobalLoadingProvider } from './global-loading';
import { queryClient } from './providers/query-client';
import { registerServiceWorker } from './register-sw';
import { ThemeProvider } from './providers/theme';
import { AppShell } from '../layouts/AppShell';
import '../shared/styles/global.css';
import { NotificationsProvider } from '../shared/ui/notifications';
import { GlobalLoadingOverlay } from '../shared/ui/GlobalLoadingOverlay';

const ExtensionPrivacyPage = lazy(() => import('../pages/extension/ExtensionPrivacyPage').then(m => ({ default: m.ExtensionPrivacyPage })));

// Register service worker for PWA caching + push notifications
registerServiceWorker();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GlobalLoadingProvider>
          <BrowserRouter basename={frontendBasePath}>
            <Suspense fallback={<GlobalLoadingOverlay />}>
              <Routes>
                <Route path="/extension/privacy" element={<ExtensionPrivacyPage />} />
                <Route path="*" element={<AppShell />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </GlobalLoadingProvider>
        <NotificationsProvider />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
