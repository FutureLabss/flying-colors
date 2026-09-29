import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/shells';
import { useAction, useToast } from '../../components/ui';
import { fn } from '../../lib/api';
import { downloadCsv } from './csv';

const FIELDS = [
  ['child_name', 'Learner · first + last name', /child|learner|student|pupil|name of child/i],
  ['age', 'Learner · age', /^age$|age/i],
  ['parent_name', 'Guardian · name', /parent|guardian|mother|father/i],
  ['phone', 'Guardian · phone (+234)', /whats\s*app$|phone|mobile|number|tel/i],
  ['group', 'Class · from WhatsApp group', /group|class/i],
  ['paid_date', 'Subscription · start', /paid|date|start/i],
  ['amount', 'Payment · amount (NGN)', /amount|fee|paid amount|naira/i],
  ['notes', 'Learner · goals', /note|goal|comment/i],
] as const;
type Field = typeof FIELDS[number][0];

interface Check { total: number; ready: number; duplicates: number; invalid_phone: number; missing_age: number; guardians: number; unmatched_class: number }

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export default function AdminImport() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<number, Field | ''>>({});
  const [check, setCheck] = useState<Check | null>(null);
  const [result, setResult] = useState<(Check & { result: { imported: number; guardians: number; classes: number; needs_review: number } }) | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const act = useAction();
  const toast = useToast();
  const qc = useQueryClient();

  const load = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { toast('Export the sheet as CSV first: File → Download → Comma-separated values.', 'error'); return; }
    const all = parseCsv((await f.text()).replace(/^﻿/, ''));
    if (all.length < 2) { toast('That file has no rows.', 'error'); return; }
    const [header, ...rows] = all;
    const used = new Set<Field>();
    const auto: Record<number, Field | ''> = {};
    header.forEach((h, i) => {
      const hit = FIELDS.find(([k, , re]) => !used.has(k) && re.test(h.trim()));
      auto[i] = hit ? hit[0] : '';
      if (hit) used.add(hit[0]);
    });
    setFile({ name: f.name, header, rows });
    setMap(auto);
    setStep(2);
  };

  const mapped = () => file!.rows.map((r) => {
    const o: Record<string, string> = {};
    Object.entries(map).forEach(([i, k]) => { if (k) o[k] = r[+i] ?? ''; });
    return o;
  });

  const runCheck = async () => {
    setBusy(true);
    const r = await act(() => fn<Check>('import-learners', { action: 'check', filename: file!.name, rows: mapped() }));
    setBusy(false);
    if (r) { setCheck(r); setStep(3); }
  };
  const runImport = async () => {
    setBusy(true);
    const r = await act(() => fn<NonNullable<typeof result>>('import-learners', { action: 'import', filename: file!.name, rows: mapped() }));
    setBusy(false);
    if (r) { setResult(r); setStep(4); await qc.invalidateQueries(); }
  };
  const reset = () => { setStep(1); setFile(null); setCheck(null); setResult(null); };
  const missing = FIELDS.filter(([k]) => ['child_name', 'phone'].includes(k) && !Object.values(map).includes(k));

  return (
    <AdminShell>
      <div className="page-head" style={{ display: 'block' }}>
        <div className="kicker-accent">One-time migration</div>
        <h2>Import existing learners</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '14px 28px 0' }}>
        {['Upload', 'Match columns', 'Check', 'Done'].map((l, i) => (
          <div key={l} style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-divider)', borderRadius: 999,
            background: i + 1 < step ? 'var(--color-text)' : i + 1 === step ? 'var(--color-accent)' : 'transparent',
            color: i + 1 <= step ? '#fff' : 'var(--color-neutral-700)' }}>{i + 1} · {l}</div>
        ))}
      </div>
      <div style={{ padding: '24px 28px', maxWidth: 900 }}>
        {step === 1 && (
          <>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => load(e.target.files?.[0])} />
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}
              style={{ width: '100%', border: '2px dashed var(--color-neutral-400)', borderRadius: 24, background: 'var(--color-surface)', minHeight: 180, cursor: 'pointer', textAlign: 'left', padding: 24 }}>
              <div style={{ font: '600 22px/1.1 var(--font-heading)', letterSpacing: '-.03em' }}>Drop the Google Sheet export here</div>
              <div style={{ fontSize: 14, marginTop: 6 }} className="muted">CSV (File → Download → Comma-separated values) · one row per learner · include guardian phone</div>
              <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: 'var(--color-accent-700)' }}>Choose a file →</div>
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => downloadCsv('learners_master_sheet_sample', [
              { 'Child Name': 'Bola Ade', Age: '8', 'Parent Name': 'Mrs K. Ade', WhatsApp: '08031234567', 'WhatsApp Group': 'FC Starlight 2', 'Paid Date': '04/10/2025', Amount: '120000', Notes: 'shy, good reader' },
              { 'Child Name': 'Kunle Ade', Age: '11', 'Parent Name': 'Mrs K. Ade', WhatsApp: '08031234567', 'WhatsApp Group': 'FC Bold Speakers', 'Paid Date': '04/10/2025', Amount: '120000', Notes: 'debates' },
              { 'Child Name': 'Ese Obi', Age: '', 'Parent Name': 'Mr T. Obi', WhatsApp: '+2348059876543', 'WhatsApp Group': 'Little Voices A', 'Paid Date': '12/01/2026', Amount: '120000', Notes: '' },
            ])}>Download a sample sheet</button>
          </>
        )}
        {step === 2 && file && (
          <>
            <div style={{ fontSize: 14, marginBottom: 10 }}><b>{file.name}</b> · {file.rows.length} rows · {file.header.length} columns</div>
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Sheet column</th><th>Sample</th><th>Maps to</th></tr></thead>
                <tbody>
                  {file.header.map((h, i) => (
                    <tr key={i}>
                      <td>{h}</td>
                      <td className="muted">{file.rows[0]?.[i]}</td>
                      <td>
                        <select className="input" style={{ fontWeight: 600, minHeight: 34 }} value={map[i] ?? ''} aria-label={`Map ${h}`}
                          onChange={(e) => setMap({ ...map, [i]: e.target.value as Field | '' })}>
                          <option value="">Don’t import</option>
                          {FIELDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missing.length > 0 && <div className="field-error">Map a column to {missing.map((m) => m[1]).join(' and ')}.</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={reset}>Back</button>
              <button type="button" className="btn btn-primary" style={{ minWidth: 180, justifyContent: 'flex-start' }} disabled={busy || missing.length > 0} onClick={runCheck}>{busy ? 'Checking…' : 'Check rows'}</button>
            </div>
          </>
        )}
        {step === 3 && check && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)' }}>
              <Tile v={check.ready - check.missing_age} label="Ready to import" />
              <Tile v={check.duplicates} label="Possible duplicates · same phone + name (skipped)" accent />
              <Tile v={check.missing_age} label="Missing age · import as “needs review”" accent last />
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-neutral-800)', margin: '14px 0' }}>
              Siblings sharing one phone number are grouped under a single guardian ({check.guardians} guardians). Nobody is messaged during import.
              {check.invalid_phone > 0 && ` ${check.invalid_phone} rows have no usable phone or name and are skipped.`}
              {check.unmatched_class > 0 && ` ${check.unmatched_class} rows don’t match a class and go to the placement queue.`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn-primary" style={{ minWidth: 180, justifyContent: 'flex-start' }} disabled={busy || check.ready === 0} onClick={runImport}>
                {busy ? 'Importing…' : `Import ${check.ready} learners`}
              </button>
            </div>
          </>
        )}
        {step === 4 && result && (
          <>
            <div style={{ background: 'var(--color-accent)', color: '#fff', borderRadius: 28, padding: 24 }}>
              <div className="num" style={{ fontSize: 40 }}>{result.result.imported} learners imported</div>
              <div style={{ fontSize: 15, marginTop: 8 }}>{result.result.guardians} guardians · {result.result.classes} classes · {result.result.needs_review} rows kept for review in Learners.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Link className="btn btn-secondary" to="/admin/learners">Open Learners</Link>
              <button type="button" className="btn btn-ghost" onClick={reset}>Import another file</button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Tile({ v, label, accent, last }: { v: number; label: string; accent?: boolean; last?: boolean }) {
  return (
    <div style={{ padding: '16px 16px 16px 0', paddingLeft: label.startsWith('Ready') ? 0 : 16, borderRight: last ? undefined : '1px solid var(--color-divider)' }}>
      <div className="num" style={{ fontSize: 36, color: accent ? 'var(--color-accent)' : undefined }}>{v}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );
}
