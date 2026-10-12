// Schedule: reading Schedulista's appointments export. The browser only turns
// the CSV into rows; matching instructors and clients and skipping what was
// already imported happen in the database (import_schedule).
import { parseCsv } from './enrollments';
import { parseCents } from './payments';

/** One booking for import_schedule. Times are studio wall-clock text. */
export interface ScheduleImportRow {
  row: number;
  start: string;
  minutes: number;
  service: string;
  instructor: string;
  source_service: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  notes: string;
  price_cents: number | null;
  created: string;
}

export type ImportProblem = { row: number; reason: string };

const SERVICES = ['Private', 'Gyrotonic', 'Pilates Group', 'Gyrotonic Group'];

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD HH:MM:SS' that is a real date and time. */
function isTime(s: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return false;
  const iso = s.replace(' ', 'T').padEnd(19, ':00');
  const d = new Date(`${iso}Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19) === iso;
}

/** 'Pilates Group with Sunnie -' → ['Pilates Group', 'Sunnie']; 'Gyrotonic Workshop' → ['Gyrotonic Workshop', '']. */
function splitService(raw: string): [string, string] {
  const s = clean(raw).replace(/[\s-]+$/, '');
  const at = s.toLowerCase().lastIndexOf(' with ');
  const service = at < 0 ? s : s.slice(0, at).trim();
  return [SERVICES.find((n) => n.toLowerCase() === service.toLowerCase()) ?? service, at < 0 ? '' : s.slice(at + 6).trim()];
}

/**
 * Schedulista's appointments export → rows for import_schedule, plus the rows
 * the browser can already tell are broken (not sent). row = line in the
 * spreadsheet, header = 1. null when the file is not that export.
 */
export function scheduleFromCsv(text: string): { rows: ScheduleImportRow[]; problems: ImportProblem[] } | null {
  const [head = [], ...body] = parseCsv(text);
  const cols = head.map((c) => c.replace(/\s+/g, '').toLowerCase());
  if (!['appointmenttime', 'appointmentduration', 'servicename', 'clientname'].every((c) => cols.includes(c))) return null;

  const rows: ScheduleImportRow[] = [];
  const problems: ImportProblem[] = [];
  body.forEach((r, i) => {
    const raw = (col: string) => r[cols.indexOf(col)] ?? '';
    const get = (col: string) => clean(raw(col));
    const row = i + 2;
    const start = get('appointmenttime');
    const minutes = Number(get('appointmentduration'));
    const [service, instructor] = splitService(raw('servicename'));
    const client_name = get('clientname');
    const reason = !isTime(start)
      ? 'Missing or invalid date/time.'
      : !Number.isInteger(minutes) || minutes < 5 || minutes > 720
        ? 'Length must be 5 to 720 minutes.'
        : !service
          ? 'Missing service.'
          : !client_name
            ? 'Missing client name.'
            : '';
    if (reason) {
      problems.push({ row, reason });
      return;
    }
    const created = get('appointmentcreated');
    rows.push({
      row,
      start: start.slice(0, 16),
      minutes,
      service,
      instructor,
      source_service: raw('servicename'),
      client_name,
      client_phone: get('clientphone'),
      client_email: get('clientemail'),
      notes: raw('appointmentnotes').trim(),
      price_cents: parseCents(get('price')),
      created: created.length === 19 && isTime(created) ? created : '',
    });
  });
  return { rows, problems };
}
