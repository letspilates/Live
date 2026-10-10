/* eslint-disable react-refresh/only-export-components */
// Session + staff profile for the portal. The profile (role, status) always
// comes from the database (current_staff), never from the browser.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'OWNER' | 'INSTRUCTOR' | 'STAFF';
export const ROLES: Role[] = ['OWNER', 'INSTRUCTOR', 'STAFF'];
export type StaffStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE';
export type PricingTier = 'CERTIFIED' | 'MASTER';

export interface Staff {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  status: StaffStatus;
  pricing_tier: PricingTier | null;
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
    supabase.rpc('current_staff').then(({ data, error }) => {
      if (stale) return;
      setProfile(
        error
          ? { userId, failed: true }
          : { userId, staff: (data as Staff | null)?.user_id ? (data as Staff) : null },
      );
    });
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
