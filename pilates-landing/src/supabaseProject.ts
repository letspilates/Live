// Which Supabase project this build talks to. Shared by the admin portal and the
// public training sign-up form; it imports nothing, so the homepage bundle does
// not pull in supabase-js.

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
export const IS_STAGING = import.meta.env.DEV || import.meta.env.BASE_URL.startsWith('/staging/');

export const SUPABASE_PROJECT = IS_STAGING ? PROJECTS.staging : PROJECTS.production;

/** false when this build has no Supabase project configured yet (production today). */
export const HAS_SUPABASE = Boolean(SUPABASE_PROJECT.url && SUPABASE_PROJECT.publishableKey);

/** Calls a public database function without a login (plain fetch, no client library). */
export async function publicRpc<T>(fn: string, args: object = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${SUPABASE_PROJECT.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PROJECT.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) throw new Error(`${fn} failed (${res.status})`);
  return res.json() as Promise<T>;
}
