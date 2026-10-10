// Admin portal routes: path under /admin/ → who may open it:
// public, staff (any active user), owner (owner or admin), or a menu that
// Settings → Admin switches on per role (owners and admins always have it).
// vite.config.ts reads this list to write an index.html into each route folder,
// so deep links and refreshes work on GitHub Pages (no SPA fallback there).
export const ADMIN_ROUTES = {
  '': 'staff',
  login: 'public',
  'set-password': 'public',
  clients: 'clients',
  trainings: 'owner',
  payments: 'payments',
  expenses: 'owner',
  reports: 'owner',
  users: 'owner',
  access: 'owner',
  notifications: 'owner',
  account: 'staff',
} as const;

export type AdminPath = keyof typeof ADMIN_ROUTES;
