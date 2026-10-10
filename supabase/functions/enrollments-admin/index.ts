// enrollments-admin: lets a signed-in owner use the training-course admin
// (Courses tab + registrations in the Google Sheet) without a second password.
// The Apps Script still checks its ADMIN_KEY; this function adds it server-side
// from the APPS_SCRIPT_ADMIN_KEY secret, so the key never reaches the browser.
//
// POST JSON { action }:
//   courses        → { courses, version }   every course, hidden ones included
//   registrations  → { registrations }
//   saveCourses    { courses: [...] } → replaces the Courses tab
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const ALLOWED_ORIGINS = [
  'https://letspilatesla.com',
  'http://localhost:5173',
];
// Same deployment the public training form and the old admin page use.
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxGzSZjRnZybJX-kqwsiPAp9UTOLmc4fxx2JKUxIWZgXnJ96c_YRYdMN3M2dgKxWUM4zQ/exec';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const PUBLISHABLE_KEY = (() => {
  const json = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  return json ? JSON.parse(json).default : Deno.env.get('SUPABASE_ANON_KEY')!;
})();

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

  // Owner check runs as the caller: the database decides who is an active owner.
  const asCaller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me, error: meError } = await asCaller.rpc('current_staff');
  if (meError) return reply(401, { error: 'Your session ended. Please sign in again.' });
  if (me?.role !== 'OWNER' || me?.status !== 'ACTIVE') {
    return reply(403, { error: 'Only an active owner can manage enrollments.' });
  }

  const key = Deno.env.get('APPS_SCRIPT_ADMIN_KEY');
  if (!key) return reply(503, { error: 'APPS_SCRIPT_ADMIN_KEY is not set.', code: 'not_configured' });

  let body: { action?: string; courses?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }

  let res: Response;
  if (body.action === 'courses' || body.action === 'registrations') {
    const query = body.action === 'courses' ? 'all=1' : 'registrations=1';
    res = await fetch(`${APPS_SCRIPT_URL}?${query}&key=${encodeURIComponent(key)}&t=${Date.now()}`);
  } else if (body.action === 'saveCourses' && Array.isArray(body.courses)) {
    res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'updateCourses', key, courses: JSON.stringify(body.courses) }),
    });
  } else {
    return reply(400, { error: 'Unknown action.' });
  }

  let out: Record<string, unknown>;
  try {
    out = await res.json();
  } catch {
    return reply(502, { error: 'The Google Sheet did not answer. Try again.' });
  }
  if (out.result !== 'success') {
    const wrongKey = out.message === 'unauthorized';
    return reply(502, {
      error: wrongKey ? 'APPS_SCRIPT_ADMIN_KEY does not match the Apps Script ADMIN_KEY.' : String(out.message ?? 'Request failed.'),
      code: wrongKey ? 'wrong_key' : undefined,
    });
  }
  delete out.result;
  return reply(200, out);
});
