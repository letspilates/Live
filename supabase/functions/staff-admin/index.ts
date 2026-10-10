// staff-admin: owner-only staff actions that need Supabase Auth admin rights
// (blocking and restoring sign-in). Staff accounts are created in the Supabase
// dashboard and linked from the portal (add_staff_account), so no invitations.
//
// Deployed by the Supabase GitHub integration on push to the project's production
// branch; supabase/config.toml turns the platform's "Verify JWT" off. The new sb_
// API keys are not JWTs, so this handler checks the caller itself: every database
// call runs with the caller's own token, and the database functions refuse anyone
// but an owner.
//
// POST JSON { action, userId }:
//   deactivate   blocks data access, then sign-in
//   reactivate   restores both
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const ALLOWED_ORIGINS = [
  'https://letspilatesla.com',
  'http://localhost:5173',
];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLISHABLE_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const SECRET_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');

// New projects expose keys as JSON {"default": "..."}; older ones as plain strings.
function envKey(jsonName: string, legacyName: string): string {
  const json = Deno.env.get(jsonName);
  return json ? JSON.parse(json).default : Deno.env.get(legacyName)!;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const asCaller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: me, error: meError } = await asCaller.rpc('current_staff');
  if (meError) return reply(401, { error: 'Your session ended. Please sign in again.' });
  if (me?.role !== 'OWNER' || me?.status !== 'ACTIVE') {
    return reply(403, { error: 'Only an active owner can manage staff.' });
  }

  let body: Record<string, string | undefined>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }
  const { action, userId } = body;

  if (!userId) return reply(400, { error: 'Missing user.' });

  if (action === 'deactivate' || action === 'reactivate') {
    const active = action === 'reactivate';
    // Database first: data access stops here even if the Auth call below fails.
    const { error } = await asCaller.rpc('set_staff_status', {
      p_user_id: userId,
      p_status: active ? 'ACTIVE' : 'INACTIVE',
    });
    if (error) return reply(400, { error: error.message });
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: active ? 'none' : '876000h',
    });
    if (banError) {
      return reply(200, {
        warning: active
          ? 'Access restored, but sign-in is still blocked. Try again.'
          : 'Data access removed, but sign-in is not blocked yet. Try again.',
      });
    }
    return reply(200, {});
  }

  return reply(400, { error: 'Unknown action.' });
});
