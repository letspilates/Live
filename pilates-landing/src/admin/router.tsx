/* eslint-disable react-refresh/only-export-components */
// History API router for /admin/*. Paths are relative to the admin root, which
// already includes the /staging/ prefix on the staging build.
import { useSyncExternalStore, type ReactNode } from 'react';
import { ADMIN_ROUTES, type AdminPath } from './routes';

const ROOT = `${import.meta.env.BASE_URL}admin/`;

export function adminUrl(path: string, search = ''): string {
  return ROOT + (path ? `${path}/` : '') + search;
}

function currentPath(): string {
  const p = window.location.pathname;
  return p.startsWith(ROOT) ? p.slice(ROOT.length).replace(/\/+$/, '') : '';
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function navigate(path: string, { search = '', replace = false } = {}) {
  const url = adminUrl(path, search);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  notify();
  window.scrollTo(0, 0);
}

/** The current admin route, or null for an unknown path. */
export function useRoute(): AdminPath | null {
  const path = useSyncExternalStore(subscribe, currentPath);
  return Object.hasOwn(ADMIN_ROUTES, path) ? (path as AdminPath) : null;
}

export function Link({
  to,
  className,
  children,
  onNavigate,
  ...rest
}: {
  to: AdminPath;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
  'aria-current'?: 'page';
  title?: string;
}) {
  return (
    <a
      {...rest}
      href={adminUrl(to)}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
