// sms-send: sends the client texts that are due, through Twilio. pg_cron wakes it every
// 5 minutes (app.sms_tick) and the portal calls it after "Send test text".
//
// No caller check on purpose: it takes no input, and the database decides what is due
// (public.sms_claim), so an extra call only sends what was about to go out anyway.
// Deployed by the Supabase GitHub integration; supabase/config.toml turns "Verify JWT" off.
//
// Secrets (Supabase › Edge Functions › Secrets): TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID,
// TWILIO_API_KEY_SECRET, TWILIO_MESSAGING_SERVICE_SID. Without them nothing is claimed.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

// Only the live project texts real clients; Staging (whose data has real phones) only
// texts the test numbers, whatever its settings say.
const LIVE_PROJECT = 'ibizgxqwndyxzebusrwb';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const ACCOUNT = Deno.env.get('TWILIO_ACCOUNT_SID');
const KEY_SID = Deno.env.get('TWILIO_API_KEY_SID');
const KEY_SECRET = Deno.env.get('TWILIO_API_KEY_SECRET');
const SERVICE = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

// New projects expose keys as JSON {"default": "..."}; older ones as plain strings.
function envKey(jsonName: string, legacyName: string): string {
  const json = Deno.env.get(jsonName);
  return json ? JSON.parse(json).default : Deno.env.get(legacyName)!;
}

const cors = {
  'Access-Control-Allow-Origin': 'https://letspilatesla.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!ACCOUNT || !KEY_SID || !KEY_SECRET || !SERVICE) return reply(503, { error: 'Twilio is not set up yet.' });

  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const live = SUPABASE_URL.includes(LIVE_PROJECT);
  const done = { SENT: 0, FAILED: 0, SKIPPED: 0 };

  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('sms_claim', { p_limit: 20 });
    if (error) return reply(500, { error: error.message, ...done });
    if (!data?.length) break;
    for (const m of data as { out_id: string; out_phone: string; out_body: string; out_test: boolean }[]) {
      let result = { p_status: 'SKIPPED', p_sid: null as string | null, p_error: 'Staging texts only the test numbers.', p_code: null as number | null };
      if (live || m.out_test) {
        try {
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + btoa(`${KEY_SID}:${KEY_SECRET}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: m.out_phone, MessagingServiceSid: SERVICE, Body: m.out_body }),
          });
          const j = await res.json().catch(() => ({}));
          result = res.ok
            ? { p_status: 'SENT', p_sid: j.sid ?? null, p_error: '', p_code: null }
            : { p_status: 'FAILED', p_sid: null, p_error: `${j.code ?? res.status}: ${j.message ?? 'Twilio refused the text.'}`, p_code: j.code ?? null };
        } catch (e) {
          result = { p_status: 'FAILED', p_sid: null, p_error: `Could not reach Twilio: ${e}`, p_code: null };
        }
      }
      await db.rpc('sms_result', { p_id: m.out_id, ...result });
      done[result.p_status as keyof typeof done]++;
    }
  }
  return reply(200, done);
});
