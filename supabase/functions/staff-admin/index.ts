// staff-admin: user actions that need Supabase Auth admin rights, for owners
// and admins (Settings → Users). The database functions hold the rules (who may
// touch owners, last owner, records); this function only adds the Auth side.
//
// Deployed by the Supabase GitHub integration on push to the project's production
// branch; supabase/config.toml turns the platform's "Verify JWT" off. The new sb_
// API keys are not JWTs, so this handler checks the caller itself: every database
// call runs with the caller's own token, and the database functions refuse anyone
// but an owner.
//
// POST JSON { action, ... }:
//   create       { email, profile, password }  sign-in made now, no email sent
//   invite       { email, profile, redirectTo } Supabase Auth emails an invitation;
//                the person sets their own password at /admin/set-password/
//   resend       { userId, redirectTo }        sends the invitation again
//                (create/invite: an email that already has a login is linked as is)
//   deactivate   { userId }  blocks data access, then sign-in
//   reactivate   { userId }  restores both
//   delete       { userId }  removes the user (refused when they have records)
// profile = { full_name, roles[], phone, address, certifications, notes, pricing_tier }
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
  const roles: string[] = me?.roles ?? [me?.role];
  if (!roles.some((r) => r === 'OWNER' || r === 'ADMIN') || me?.status !== 'ACTIVE') {
    return reply(403, { error: 'Only an active owner or admin can manage users.' });
  }

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }
  const { action, userId } = body;

  // Invitation links must come back to this site's set-password page.
  const redirectTo = String(body.redirectTo ?? '');
  const redirectOk = ALLOWED_ORIGINS.some((o) => redirectTo.startsWith(o + '/')) && redirectTo.endsWith('/admin/set-password/');

  if (action === 'create' || action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const profile = body.profile ?? {};
    const fullName = String(profile.full_name ?? '').trim();
    const password = String(body.password ?? '');
    if (!EMAIL_RE.test(email)) return reply(400, { error: 'Enter a valid email address.' });
    if (!fullName || fullName.length > 80) return reply(400, { error: 'Enter a name (up to 80 characters).' });
    if (action === 'create' && password.length < 8) return reply(400, { error: 'Use a password of at least 8 characters.' });
    if (action === 'invite' && !redirectOk) return reply(400, { error: 'Invalid invitation link.' });

    const { data: created, error: createError } =
      action === 'create'
        ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
        : await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName } });
    const existed = createError?.code === 'email_exists';
    if (createError && !existed) return reply(400, { error: createError.message, code: createError.code });

    // The database checks again that the caller may do this (and owner rules).
    const { error: linkError } = await asCaller.rpc('add_staff_user', {
      p_user_id: created?.user?.id ?? null,
      p_email: email,
      p_invited: action === 'invite' && !existed,
      p: profile,
    });
    if (linkError) {
      // Never leave a new login behind without a profile.
      if (created?.user) await admin.auth.admin.deleteUser(created.user.id);
      return reply(400, { error: linkError.message, code: linkError.code });
    }
    return reply(200, { linkedExisting: existed });
  }

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

  if (action === 'resend') {
    if (!redirectOk) return reply(400, { error: 'Invalid invitation link.' });
    const { data: rows, error } = await asCaller.from('staff_profiles').select('email, status').eq('user_id', userId);
    const row = rows?.[0];
    if (error || !row) return reply(400, { error: 'User not found.' });
    if (row.status !== 'INVITED') return reply(400, { error: 'This person has already joined.' });
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(row.email, { redirectTo });
    if (inviteError) return reply(400, { error: inviteError.message, code: inviteError.code });
    return reply(200, {});
  }

  if (action === 'delete') {
    // Database first: refuses owners (for admins), yourself, the last owner and
    // anyone with records. Then the sign-in itself.
    const { error } = await asCaller.rpc('delete_staff_user', { p_user_id: userId });
    if (error) return reply(400, { error: error.message, code: error.code });
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) return reply(200, { warning: 'Removed from the portal, but the sign-in could not be deleted.' });
    return reply(200, {});
  }

  return reply(400, { error: 'Unknown action.' });
});
