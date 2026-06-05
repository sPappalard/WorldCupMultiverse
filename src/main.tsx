import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { App } from './ui/App';
import { I18nProvider } from './i18n';
import 'flag-icons/css/flag-icons.min.css';
import './ui/styles.css';

inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
