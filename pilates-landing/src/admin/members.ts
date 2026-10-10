// Members: reading the client exports of Mindbody and Schedulista. The browser
// only turns the CSV into rows; matching and merging happen in the database
// (import_members), so a re-import never creates duplicates.
import { parseCsv } from './enrollments';

export type MemberSource = 'MINDBODY' | 'SCHEDULISTA';

export interface Member {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  mindbody_id: string | null;
  mindbody_imported_at: string | null;
  schedulista_key: string | null;
  schedulista_imported_at: string | null;
  schedulista_last_visit: string | null;
  schedulista_next_visit: string | null;
  schedulista_visits: number | null;
  schedulista_services: string[];
  schedulista_notes: string;
}

export interface ImportRow {
  full_name: string;
  phone: string;
  email: string;
  address?: string;
  mindbody_id?: string;
  last_visit?: string;
  next_visit?: string;
  visits?: string;
  services?: string[];
  notes?: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const timestamp = (s: string | undefined) => (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(clean(s)) ? clean(s) : '');

/** ["All", "Private with Sunnie "] → ['Private with Sunnie']. "All" is Schedulista's catch-all, not a service. */
function services(raw: string): string[] {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    list = raw.replace(/[[\]"]/g, '').split(',');
  }
  return (Array.isArray(list) ? list : [])
    .map((s) => clean(String(s)))
    .filter((s) => s && s.toLowerCase() !== 'all');
}

/**
 * Which export is this, and its rows. Mindbody puts a row of column numbers
 * above the real header and a "Total records" line at the end; Schedulista
 * has no client ID. null when the file is neither.
 */
export function membersFromCsv(text: string): { source: MemberSource; rows: ImportRow[]; skipped: number } | null {
  const table = parseCsv(text);
  for (let h = 0; h < Math.min(table.length, 5); h++) {
    const head = table[h].map((c) => c.trim().toLowerCase());
    const col = (name: string) => head.indexOf(name);
    const get = (row: string[], name: string) => (col(name) >= 0 ? row[col(name)] ?? '' : '');
    const body = table.slice(h + 1);

    if (col('id') >= 0 && col('first name') >= 0 && col('mobile phone') >= 0) {
      const rows = body
        .filter((r) => /^\d+$/.test(clean(get(r, 'id'))))
        .map((r) => ({
          mindbody_id: clean(get(r, 'id')),
          full_name: clean(`${get(r, 'first name')} ${get(r, 'last name')}`),
          phone: clean(get(r, 'mobile phone') || get(r, 'home phone') || get(r, 'work phone')),
          email: clean(get(r, 'email')),
          address: ['address', 'city', 'state', 'postal code'].map((k) => clean(get(r, k))).filter(Boolean).join(', '),
        }))
        .filter((r) => r.full_name);
      return { source: 'MINDBODY', rows, skipped: body.length - rows.length };
    }

    if (col('first name') >= 0 && col('phone') >= 0 && col('appointment count') >= 0) {
      const rows = body
        .map((r) => ({
          full_name: clean(`${get(r, 'first name')} ${get(r, 'last name')}`),
          phone: clean(get(r, 'phone')),
          email: clean(get(r, 'email')),
          last_visit: timestamp(get(r, 'last appointment')),
          next_visit: timestamp(get(r, 'next appointment')),
          visits: /^\d+$/.test(clean(get(r, 'appointment count'))) ? clean(get(r, 'appointment count')) : '',
          services: services(get(r, 'services')),
          notes: clean(get(r, 'client notes')),
        }))
        .filter((r) => r.full_name);
      return { source: 'SCHEDULISTA', rows, skipped: body.length - rows.length };
    }
  }
  return null;
}
