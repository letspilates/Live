import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Invitation and password-reset emails land on /admin/set-password/ with the
// result in the URL hash (#type=invite / #error_code=otp_expired …). Read it
// before the client below consumes and clears the hash.
export const EMAIL_LINK = new URLSearchParams(window.location.hash.slice(1));

// Publishable keys are public by design (they ship in the page). The data is
// protected by Row Level Security and database functions, not by these values.
// Secret / service-role keys must never appear in this repository.
const PROJECTS = {
  staging: {
    url: 'https://prklzkcrhfnnlefvmxhb.supabase.co',
    publishableKey: 'sb_publishable_f8xs6ixyPvqZGjf3nGl_1Q_7dj0CQZL',
  },
  // Created before real payments are recorded (master plan, Phase 5).
  production: { url: '', publishableKey: '' },
};

/** Local dev and the /staging/ build use the staging project. */
export const IS_STAGING =
  import.meta.env.DEV || import.meta.env.BASE_URL.startsWith('/staging/');

const project = IS_STAGING ? PROJECTS.staging : PROJECTS.production;

/** null when this build has no Supabase project configured yet. */
export const supabase: SupabaseClient | null =
  project.url && project.publishableKey
    ? createClient(project.url, project.publishableKey)
    : null;

/** Reads the message an Edge Function returned with a non-2xx status. */
export async function functionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      /* not JSON */
    }
  }
  return null;
}
