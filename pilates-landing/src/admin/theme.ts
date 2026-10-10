// Light / dark portal. The choice is remembered on this device; until the user
// picks one, the device setting decides. The class goes on <html> (admin.css).
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'lp-admin-theme';
const listeners = new Set<() => void>();

function saved(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

let theme: Theme = saved() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme() {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked: still switches for this visit */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => theme,
  );
}
