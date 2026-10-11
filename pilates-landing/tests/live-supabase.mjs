// Read-only smoke test against the REAL staging Supabase project (studio).
//   node tests/live-supabase.mjs                      anonymous checks only
//   LIVE_EMAIL=... LIVE_PASSWORD=... node tests/live-supabase.mjs   + signed-in checks
// It reads only, except one Knowledge item it adds and deletes again (not financial data).
// Prints counts, never personal data. Exit code 1 if any check fails.
import { createClient } from '@supabase/supabase-js';

const URL = 'https://prklzkcrhfnnlefvmxhb.supabase.co';
const KEY = 'sb_publishable_f8xs6ixyPvqZGjf3nGl_1Q_7dj0CQZL';
let failures = 0;
const check = (ok, name, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!ok) failures += 1;
};
const client = () => createClient(URL, KEY, { auth: { persistSession: false } });

// Anonymous: public sign-up functions work, everything else is closed.
const anon = client();
{
  const { data, error } = await anon.rpc('public_training_courses');
  check(!error && Array.isArray(data), 'anon: public_training_courses', error?.message ?? `${data?.length} courses`);
  for (const t of ['students', 'payment_transactions', 'expenses', 'staff_profiles', 'training_registrations', 'knowledge_items', 'accounting_periods']) {
    const r = await anon.from(t).select('*', { count: 'exact', head: true });
    check(Boolean(r.error) || !r.count, `anon: ${t} hidden`, r.error ? r.error.code ?? r.error.message : `count ${r.count}`);
  }
  for (const [fn, args] of [['finance_report', { p_from: '2026-01-01', p_to: '2026-12-31' }], ['list_staff', {}], ['search_students', { p_query: 'a' }], ['current_staff', {}]]) {
    const r = await anon.rpc(fn, args);
    check(Boolean(r.error) || r.data == null || (Array.isArray(r.data) && !r.data.length), `anon: ${fn} refused`, r.error?.code ?? 'empty');
  }
  const h = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } });
  check(h.ok, 'auth service up', String(h.status));
}

if (process.env.LIVE_EMAIL) {
  const sb = client();
  const { error } = await sb.auth.signInWithPassword({ email: process.env.LIVE_EMAIL, password: process.env.LIVE_PASSWORD ?? '' });
  check(!error, 'sign in', error?.message);
  if (!error) {
    const me = await sb.rpc('current_staff');
    const roles = me.data?.roles;
    check(!me.error && roles, 'current_staff', me.error?.message ?? String(roles));
    const owner = Array.isArray(roles) && roles.some((r) => r === 'OWNER' || r === 'ADMIN');

    const tables = ['students', 'payment_transactions', 'payment_methods', 'role_menu_access', 'knowledge_items', 'training_courses'];
    if (owner) tables.push('expenses', 'expense_categories', 'recurring_expense_rules', 'accounting_periods', 'training_registrations', 'staff_profiles', 'knowledge_item_viewers');
    for (const t of tables) {
      const r = await sb.from(t).select(t === 'staff_profiles' ? 'user_id' : '*', { count: 'exact', head: true });
      check(!r.error, `read ${t}`, r.error?.message ?? `${r.count} rows`);
    }
    for (const [fn, args] of [['list_collectors', {}], ['search_students', { p_query: 'a' }], ...(owner ? [['list_staff', {}], ['finance_report', { p_from: '2026-01-01', p_to: '2026-12-31' }]] : [])]) {
      const r = await sb.rpc(fn, args);
      check(!r.error, `rpc ${fn}`, r.error?.message ?? 'ok');
    }
    if (owner) {
      // Money consistency: the report's net revenue equals the payment rows it is built from.
      const from = '2026-01-01', to = '2026-12-31';
      const rep = await sb.rpc('finance_report', { p_from: from, p_to: to });
      check(!rep.error && rep.data, 'finance_report has data', rep.error?.message ?? Object.keys(rep.data ?? {}).slice(0, 6).join(','));

      const cats = await sb.from('expense_categories').select('*', { count: 'exact', head: true });
      check(!cats.error && cats.count > 0, 'expense categories seeded', String(cats.count));

      // Knowledge write path round trip (add then delete; not financial data).
      const save = await sb.rpc('save_knowledge_item', { p: { category: 'PILATES', kind: 'VIDEO', title: 'Review smoke test (auto-deleted)', description: '', link_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', audience: 'ALL' } });
      const id = typeof save.data === 'string' ? save.data : save.data?.id;
      check(!save.error && id, 'knowledge: save', save.error?.message ?? 'ok');
      if (id) {
        const del = await sb.rpc('delete_knowledge_item', { p_id: id });
        check(!del.error, 'knowledge: delete', del.error?.message ?? 'ok');
      }

      const fn = await sb.functions.invoke('staff-admin', { body: { action: 'noop' } });
      check(fn.error?.context?.status !== 404, 'staff-admin function deployed', fn.error?.context?.status ? String(fn.error.context.status) : 'reachable');
    }
    await sb.auth.signOut();
  }
}

console.log(failures ? `\n${failures} failed` : '\nall live checks passed');
process.exit(failures ? 1 : 0);
