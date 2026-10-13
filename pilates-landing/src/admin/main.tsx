import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './admin.css';
import App, { NotConfigured } from './App';
import { AuthProvider } from './auth';
import { IS_STAGING, supabase } from './supabase';
import { applyTheme } from './theme';

applyTheme();
// Tells the tabs apart: the staging portal looks the same as production otherwise.
if (IS_STAGING) document.title = `Staging · ${document.title}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabase ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
);
