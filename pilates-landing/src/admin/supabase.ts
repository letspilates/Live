import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HAS_SUPABASE, SUPABASE_PROJECT } from '../supabaseProject';

// Invitation and password-reset emails land on /admin/set-password/ with the
// result in the URL hash (#type=invite / #error_code=otp_expired …). Read it
// before the client below consumes and clears the hash.
export const EMAIL_LINK = new URLSearchParams(window.location.hash.slice(1));

// Project URL and publishable key: see ../supabaseProject.ts.
export { IS_STAGING } from '../supabaseProject';

/** null when this build has no Supabase project configured yet. */
export const supabase: SupabaseClient | null = HAS_SUPABASE
  ? createClient(SUPABASE_PROJECT.url, SUPABASE_PROJECT.publishableKey)
  : null;

/** Reads { error, code } that an Edge Function returned with a non-2xx status. */
export async function functionError(error: unknown): Promise<{ error?: string; code?: string }> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      /* not JSON */
    }
  }
  return {};
}
