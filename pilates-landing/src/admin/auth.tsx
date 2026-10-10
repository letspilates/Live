/* eslint-disable react-refresh/only-export-components */
// Session + staff profile for the portal. The profile (role, status) always
// comes from the database (current_staff), never from the browser.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ADMIN_ROUTES, type AdminPath } from './routes';
import { supabase } from './supabase';

export type Role = 'OWNER' | 'ADMIN' | 'STAFF' | 'INSTRUCTOR';
/** Highest first, the order the database keeps them in. */
export const ROLES: Role[] = ['OWNER', 'ADMIN', 'STAFF', 'INSTRUCTOR'];
/** Menus Settings → Admin can switch on for STAFF / INSTRUCTOR. */
export type Menu = 'schedule' | 'clients' | 'payments';
export const MENUS: Menu[] = ['schedule', 'clients', 'payments'];
export type StaffStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE';
export type PricingTier = 'CERTIFIED' | 'MASTER';

export interface Staff {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  roles: Role[];
  status: StaffStatus;
  pricing_tier: PricingTier | null;
  phone: string;
  address: string;
  certifications: string;
  notes: string;
  /** Menus this person may open (from Settings → Admin). Every menu for OWNER / ADMIN. */
  menus: Menu[];
}

/** Owner or admin: every menu, editing, deleting, managing users. */
export const isAdmin = (s: Pick<Staff, 'roles'>) => s.roles.some((r) => r === 'OWNER' || r === 'ADMIN');

/** Whether this active user may open a portal page (the database enforces the same rules). */
export function canOpen(s: Staff, path: AdminPath): boolean {
  const need = ADMIN_ROUTES[path];
  if (need === 'public' || need === 'staff') return true;
  if (need === 'owner') return isAdmin(s);
  return s.menus.includes(need);
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; expired: boolean }
  | { status: 'error' }
  | { status: 'signed-in'; session: Session; staff: Staff | null };

interface AuthValue {
  state: AuthState;
  /** Reload the profile after the user changed it (e.g. their name). */
  refresh: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

type Profile = { userId: string; staff: Staff | null } | { userId: string; failed: true };

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = not known yet, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [version, setVersion] = useState(0);
  // A sign-out the user did not ask for means the session expired.
  const [expired, setExpired] = useState(false);
  const signingOut = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    // Fires INITIAL_SESSION first, then sign-in, refresh and sign-out events.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') setExpired(!signingOut.current);
      if (event === 'SIGNED_IN') setExpired(false);
      signingOut.current = false;
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    let stale = false;
    Promise.all([supabase.rpc('current_staff'), supabase.from('role_menu_access').select('role, menu')]).then(
      ([me, access]) => {
        if (stale) return;
        const row = me.data as Omit<Staff, 'menus'> | null;
        if (me.error || access.error) return setProfile({ userId, failed: true });
        if (!row?.user_id) return setProfile({ userId, staff: null });
        const roles = row.roles?.length ? row.roles : [row.role];
        const granted = (access.data as { role: Role; menu: Menu }[]).filter((a) => roles.includes(a.role));
        const menus = isAdmin({ roles }) ? MENUS : MENUS.filter((m) => granted.some((a) => a.menu === m));
        setProfile({ userId, staff: { ...row, roles, menus } });
      },
    );
    return () => {
      stale = true;
    };
  }, [userId, version]);

  let state: AuthState;
  if (session === undefined) state = { status: 'loading' };
  else if (session === null) state = { status: 'signed-out', expired };
  else if (!profile || profile.userId !== session.user.id) state = { status: 'loading' };
  else if ('failed' in profile) state = { status: 'error' };
  else state = { status: 'signed-in', session, staff: profile.staff };

  const value: AuthValue = {
    state,
    refresh: () => setVersion((v) => v + 1),
    signOut: async () => {
      signingOut.current = true;
      await supabase?.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The signed-in staff member. Only call on pages behind the access gate. */
export function useStaff(): Staff {
  const { state } = useAuth();
  if (state.status !== 'signed-in' || !state.staff) throw new Error('useStaff outside the gate');
  return state.staff;
}
