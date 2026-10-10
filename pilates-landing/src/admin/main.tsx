import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './admin.css';
import App, { NotConfigured } from './App';
import { AuthProvider } from './auth';
import { supabase } from './supabase';
import { applyTheme } from './theme';

applyTheme();

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
