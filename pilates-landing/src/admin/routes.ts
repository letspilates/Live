// Admin portal routes: path under /admin/ → who may open it.
// vite.config.ts reads this list to write an index.html into each route folder,
// so deep links and refreshes work on GitHub Pages (no SPA fallback there).
export const ADMIN_ROUTES = {
  '': 'staff',
  login: 'public',
  'set-password': 'public',
  staff: 'owner',
  account: 'staff',
} as const;

export type AdminPath = keyof typeof ADMIN_ROUTES;
