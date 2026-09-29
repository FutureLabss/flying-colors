import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Kicker, Loading, Pills } from '../../components/ui';
import { rpc } from '../../lib/api';
import { downloadCsv } from './csv';

type Range = 'week' | 'month' | 'term';
interface Report {
  enquiry_to_placement_days: number | null; register_pct: number | null; whatsapp_submissions: number;
  feedback_by_correction_day_pct: number | null; review_minutes: number | null;
  by_class: { name: string; submitted_pct: number | null; attendance_pct: number | null }[];
  active_learners: number; fill_pct: number | null; renewals_due_30: number; expiries_flagged_pct: number | null;
}

export default function AdminReports() {
  const [range, setRange] = useState<Range>('week');
  const q = useQuery({ queryKey: ['report', range], queryFn: () => rpc<Report>('pilot_report', { p_range: range }) });
  const week = useQuery({ queryKey: ['week-info'], queryFn: () => rpc<{ week: number }>('week_info') });
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'Africa/Lagos' }).format(new Date());
  const d = q.data;

  const metrics: [string, string, string, boolean][] = d ? [
    [d.enquiry_to_placement_days != null ? `${d.enquiry_to_placement_days} days` : '—', 'Enquiry → placement', 'Baseline 4 days · target ≤ 2', (d.enquiry_to_placement_days ?? 0) > 2],
    [d.register_pct != null ? `${d.register_pct}%` : '—', 'Sessions with a register', `Target 100% · ${d.register_pct === 100 ? 'met' : `${100 - (d.register_pct ?? 0)} pts short`}`, d.register_pct != null && d.register_pct < 100],
    [String(d.whatsapp_submissions), 'Submissions via WhatsApp', 'Target 0 · met', false],
    [d.feedback_by_correction_day_pct != null ? `${d.feedback_by_correction_day_pct}%` : '—', 'Feedback by correction day',
      (d.feedback_by_correction_day_pct ?? 100) >= 90 ? 'Target ≥ 90% · met' : `Target ≥ 90% · ${90 - (d.feedback_by_correction_day_pct ?? 0)} pts short`, (d.feedback_by_correction_day_pct ?? 100) < 90],
    [d.review_minutes != null ? `${d.review_minutes} min` : '—', 'Review time per submission', 'Baseline 7 min', false],
  ] : [];

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">Pilot{week.data ? ` · term week ${week.data.week}` : ''}</div><h2>Reports</h2></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pills value={range} onChange={setRange} btnStyle={{ minHeight: 36, padding: '0 12px' }} options={[['week', 'This week'], ['month', month], ['term', 'Term']] as const} />
          <button type="button" className="btn btn-secondary" disabled={!d} onClick={() => d && downloadCsv(`report-${range}`, [
            ...metrics.map(([v, label, sub]) => ({ Metric: label, Value: v, Note: sub })),
            ...d.by_class.map((c) => ({ Metric: `${c.name} · tasks submitted / attendance`, Value: `${c.submitted_pct ?? '—'}% / ${c.attendance_pct ?? '—'}%`, Note: '' })),
          ])}>Export CSV</button>
        </div>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : d && (
        <>
          <Kicker style={{ padding: '18px 28px 8px' }}>Pilot success metrics</Kicker>
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', borderTop: '1px solid var(--color-divider)', margin: '0 28px' }}>
            {metrics.map(([v, label, sub, short], i) => (
              <div key={label} style={{ padding: i === 0 ? '16px 16px 16px 0' : 16 }}>
                <div className="num" style={{ fontSize: 32, color: short ? 'var(--color-accent)' : undefined }}>{v}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{label}</div>
                <div className="small" style={{ color: short ? 'var(--color-accent-700)' : 'var(--color-neutral-700)' }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '22px 28px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Submission and attendance by class</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '0 16px', paddingBottom: 6, borderBottom: '1px solid var(--color-divider)' }} className="kicker">
              <span>Class</span><span>Tasks submitted</span><span>Attendance</span>
            </div>
            {d.by_class.map((b) => (
              <div key={b.name} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '0 16px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                <Bar pct={b.submitted_pct} color="var(--color-text)" />
                <Bar pct={b.attendance_pct} color="var(--color-accent)" />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 24, borderTop: '1px solid var(--color-divider)' }}>
              {[[d.active_learners, 'Active learners'], [d.fill_pct != null ? `${d.fill_pct}%` : '—', 'Class fill'], [d.renewals_due_30, 'Renewals due in 30 days'],
                [d.expiries_flagged_pct != null ? `${d.expiries_flagged_pct}%` : '—', 'Expiries flagged ≥ 7 days ahead']].map(([v, label], i) => (
                <div key={String(label)} style={{ padding: i === 0 ? '14px 14px 14px 0' : 14, borderRight: i < 3 ? '1px solid var(--color-divider)' : undefined }}>
                  <div className="num" style={{ fontSize: 24 }}>{v}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Bar({ pct, color }: { pct: number | null; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 14, background: 'var(--color-neutral-200)', borderRadius: 999 }}>
        <div style={{ height: 14, background: color, borderRadius: 999, width: `${pct ?? 0}%` }} />
      </div>
      <span style={{ width: 40 }}>{pct != null ? `${pct}%` : '—'}</span>
    </div>
  );
}
