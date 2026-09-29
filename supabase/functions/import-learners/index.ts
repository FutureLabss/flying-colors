// One-time import of the legacy Google Sheet. The browser parses the file and
// maps columns; this function checks and imports the rows.
//   { action: "check" | "import", filename, rows: ImportRow[] }
// Nobody is messaged during import. Siblings sharing a phone number are
// grouped under one guardian.
import { admin, HttpError, json, normalisePhone, requireRole, serve } from '../_shared/http.ts';

interface ImportRow {
  child_name?: string;
  age?: string | number;
  parent_name?: string;
  phone?: string;
  group?: string;
  paid_date?: string;
  amount?: string | number;
  notes?: string;
}

interface Prepared {
  first_name: string;
  last_name: string;
  age: number | null;
  parent_name: string;
  phone: string;
  class_id: string | null;
  paid_on: string | null;
  amount_minor: number | null;
  goals: string;
}

function parseDate(s?: string): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy, as Nigerian sheets use
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

serve(async (req, body) => {
  const { user } = await requireRole(req, 'owner');
  const rows = (body.rows ?? []) as ImportRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'The file has no rows');
  if (rows.length > 5000) throw new HttpError(400, 'Split files over 5,000 rows');
  const db = admin();

  const { data: classes } = await db.from('classes').select('id, legacy_group_key');
  const matchClass = (group?: string) => {
    const g = (group ?? '').toLowerCase();
    return classes?.find((c) => c.legacy_group_key && g.includes(c.legacy_group_key))?.id ?? null;
  };

  // Existing learners by guardian phone, to catch re-imports.
  const { data: existing } = await db.from('learners').select('first_name, profiles!learners_guardian_id_fkey(phone)');
  const seen = new Set(
    (existing ?? []).map((l) => `${(l.profiles as unknown as { phone: string } | null)?.phone}|${l.first_name.toLowerCase()}`),
  );

  const ready: Prepared[] = [];
  let duplicates = 0, invalidPhone = 0, missingAge = 0;
  for (const r of rows) {
    const phone = normalisePhone(String(r.phone ?? ''));
    const [first, ...rest] = String(r.child_name ?? '').trim().split(/\s+/);
    if (!phone || !first) { invalidPhone++; continue; }
    const key = `${phone}|${first.toLowerCase()}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const age = Number.parseInt(String(r.age ?? ''), 10);
    if (!Number.isFinite(age)) missingAge++;
    const amount = Number.parseFloat(String(r.amount ?? '').replace(/[^\d.]/g, ''));
    ready.push({
      first_name: first, last_name: rest.join(' '), age: Number.isFinite(age) ? age : null,
      parent_name: String(r.parent_name ?? '').trim(), phone, class_id: matchClass(r.group),
      paid_on: parseDate(r.paid_date), amount_minor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
      goals: String(r.notes ?? '').trim(),
    });
  }
  const guardians = new Set(ready.map((r) => r.phone)).size;
  const summary = {
    total: rows.length, ready: ready.length, duplicates, invalid_phone: invalidPhone, missing_age: missingAge,
    guardians, unmatched_class: ready.filter((r) => !r.class_id).length,
  };
  if (body.action === 'check') return json(summary);
  if (body.action !== 'import') throw new HttpError(400, 'Unknown action');

  // Find or create one guardian account per phone number (no messages sent).
  const phones = [...new Set(ready.map((r) => r.phone))];
  const { data: profs } = await db.from('profiles').select('id, phone').in('phone', phones);
  const byPhone = new Map((profs ?? []).map((p) => [p.phone as string, p.id as string]));
  for (const phone of phones) {
    if (byPhone.has(phone)) continue;
    const name = ready.find((r) => r.phone === phone)!.parent_name;
    const { data, error } = await db.auth.admin.createUser({
      phone, phone_confirm: true, app_metadata: { role: 'parent' },
      user_metadata: { full_name: name, display_name: name },
    });
    if (error) throw new HttpError(500, `Could not create guardian ${phone}: ${error.message}`);
    byPhone.set(phone, data.user.id);
  }

  const { data, error } = await db.rpc('import_learner_rows', {
    p_filename: String(body.filename ?? 'import.csv'),
    p_total: rows.length,
    p_rows: ready.map((r) => ({ ...r, guardian_id: byPhone.get(r.phone) })),
    p_skipped: duplicates + invalidPhone,
    p_actor: user.id,
  });
  if (error) throw new HttpError(500, error.message);
  return json({ ...summary, result: data });
});
