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
  schedule: 'schedule',
  'schedule/settings': 'schedule',
  trainings: 'owner',
  knowledge: 'staff',
  payments: 'payments',
  expenses: 'owner',
  reports: 'owner',
  'settings/users': 'owner',
  'settings/notifications': 'owner',
  'settings/access': 'owner',
  // Old addresses, forwarded to the ones above.
  users: 'owner',
  admin: 'owner',
  access: 'owner',
  notifications: 'owner',
  'schedule-settings': 'schedule',
  backup: 'owner',
  account: 'staff',
} as const;

export type AdminPath = keyof typeof ADMIN_ROUTES;
