// staff-admin: owner-only staff account actions that need Supabase Auth admin
// rights (sending invitations, deleting a pending invite, blocking sign-in).
//
// Deploy: Dashboard → Edge Functions → Deploy a new function → name "staff-admin",
// paste this file, and turn "Verify JWT" OFF. The new sb_ API keys are not JWTs,
// so this handler checks the caller itself: every database call runs with the
// caller's own token, and the database functions refuse anyone but an owner.
//
// POST JSON { action, ... }:
//   invite      { email, fullName, pricingTier?, redirectTo }  (also re-sends)
//   cancel      { userId }    pending invitations only
//   deactivate  { userId }    blocks data access, then sign-in
//   reactivate  { userId }
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const ALLOWED_ORIGINS = [
  'https://letspilatesla.com',
  'http://localhost:5173',
];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLISHABLE_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const SECRET_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (action === 'invite') {
    const email = (body.email ?? '').trim().toLowerCase();
    const fullName = (body.fullName ?? '').trim();
    const redirectTo = body.redirectTo ?? '';
    if (!EMAIL_RE.test(email)) return reply(400, { error: 'Enter a valid email address.' });
    if (!fullName || fullName.length > 80) return reply(400, { error: 'Enter a name (up to 80 characters).' });
    if (!ALLOWED_ORIGINS.some((o) => redirectTo.startsWith(o + '/'))) {
      return reply(400, { error: 'Invalid redirect address.' });
    }

    const { data: existing } = await asCaller
      .from('staff_profiles')
      .select('status')
      .eq('email', email)
      .maybeSingle();
    if (existing && existing.status !== 'INVITED') {
      return reply(409, { error: 'This person already has a staff account.' });
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName },
    });
    if (inviteError || !invited.user) {
      return reply(400, { error: inviteError?.message ?? 'The invitation could not be sent.' });
    }

    const { error: recordError } = await asCaller.rpc('record_staff_invite', {
      p_user_id: invited.user.id,
      p_full_name: fullName,
      p_email: email,
      p_pricing_tier: body.pricingTier || null,
    });
    if (recordError) {
      // Do not leave a sign-in account behind without a staff profile.
      if (!existing) await admin.auth.admin.deleteUser(invited.user.id);
      return reply(400, { error: recordError.message });
    }
    return reply(200, { userId: invited.user.id });
  }

  if (!userId) return reply(400, { error: 'Missing user.' });

  if (action === 'cancel') {
    const { data: cancelled, error } = await asCaller.rpc('cancel_staff_invite', { p_user_id: userId });
    if (error) return reply(400, { error: error.message });
    if (!cancelled) return reply(409, { error: 'Only pending invitations can be cancelled.' });
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return reply(200, { warning: 'Invitation cancelled, but the sign-in account remains.' });
    return reply(200, {});
  }

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
