import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Kicker, Loading } from '../../components/ui';
import { rpc } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateOnly, dayDate, dayMonth, shortBand, weekdayLong } from '../../lib/format';
import { downloadCsv } from './csv';

interface Overview {
  week: { week: number; today: string };
  active_learners: number; new_this_week: number; class_count: number; full_classes: number; fill_pct: number | null;
  weekend_attendance_pct: number | null; weekend_absent: number; feedback_on_time_pct: number | null; submitted_pct: number | null;
  pending_payments: number; card_verified_today: number; reversals_flagged: number; to_place: number; oldest_wait_days: number | null;
  next_cohort: string | null; renewals: number;
  classes: { id: string; name: string; age_min: number; age_max: number; level: string; capacity: number; tutor_name: string | null;
    filled: number; attendance_pct: number | null; submitted: number; reviewed: number; task_id: string | null }[];
}

const greeting = () => {
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date());
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function AdminOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => rpc<Overview>('admin_overview') });
  const can = (...roles: string[]) => !!profile && roles.includes(profile.role);

  return (
    <AdminShell>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : q.data && (() => {
        const d = q.data;
        const today = `${d.week.today}T12:00:00Z`;
        return (
          <>
            <div className="page-head" style={{ display: 'block' }}>
              <div className="kicker-accent">{weekdayLong(today)} {dayMonth(today)} · week {d.week.week}</div>
              <h2>{greeting()}, {profile?.display_name || profile?.full_name}</h2>
            </div>
            <div className="stat-row" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>
              <Kpi v={d.active_learners} label="Active learners" sub={`+${d.new_this_week} this week`} />
              <Kpi v={pct(d.fill_pct)} label="Class fill" sub={`${d.class_count} classes · ${d.full_classes} full`} />
              <Kpi v={pct(d.weekend_attendance_pct)} label="Weekend attendance" sub={`${d.weekend_absent} absent · all followed up`} />
              <Kpi v={pct(d.feedback_on_time_pct)} label="Feedback on time" sub="Target 90%" subAccent={(d.feedback_on_time_pct ?? 100) < 90} />
              <Kpi v={pct(d.submitted_pct)} label="Tasks submitted" sub="Current task" />
            </div>
            <Kicker style={{ padding: '18px 28px 8px' }}>Needs action</Kicker>
            <div className="collapse-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderTop: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)', margin: '0 28px' }}>
              <Action n={d.pending_payments} title="Bank transfers to approve"
                sub={`${d.card_verified_today} card payment${d.card_verified_today === 1 ? '' : 's'} auto-verified today.${d.reversals_flagged ? ` ${d.reversals_flagged} reversal flagged.` : ''}`}
                cta="Open payment queue" onClick={can('owner', 'customer_service') ? () => navigate('/admin/payments') : undefined} first />
              <Action n={d.to_place} title="Paid learners to place"
                sub={`${d.next_cohort ? `Next cohort starts ${dayDate(dateOnly(d.next_cohort))}.` : ''}${d.oldest_wait_days != null ? ` Oldest waiting ${d.oldest_wait_days} day${d.oldest_wait_days === 1 ? '' : 's'}.` : ''}`}
                cta="Open placement queue" onClick={can('owner', 'lead_tutor') ? () => navigate('/admin/placement') : undefined} />
              <Action n={d.renewals} title="Renewals to follow up" sub="Expiring in 7 days, expired, or in arrears."
                cta="Open renewals" onClick={can('owner', 'customer_service') ? () => navigate('/admin/renewals') : undefined} last />
            </div>
            <div style={{ padding: '22px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h4 style={{ margin: '0 0 8px' }}>Classes this week</h4>
                <button type="button" className="btn btn-ghost" onClick={() => downloadCsv('classes-this-week', d.classes.map((c) => ({
                  Class: c.name, Band: shortBand(c), Tutor: c.tutor_name ?? '', Filled: c.filled, Capacity: c.capacity,
                  Attendance: c.attendance_pct ?? '', Submitted: c.filled ? Math.round((c.submitted / c.filled) * 100) : '', Reviewed: c.reviewed,
                })))}>Export report</button>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Class</th><th>Band</th><th>Tutor</th><th>Fill</th><th>Attendance</th><th>Submitted</th><th>Feedback</th></tr></thead>
                  <tbody>
                    {d.classes.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{shortBand(c)}</td>
                        <td>{c.tutor_name ?? '—'}</td>
                        <td style={c.filled >= c.capacity ? { color: 'var(--color-accent-700)', fontWeight: 600 } : undefined}>{c.filled} / {c.capacity}{c.filled >= c.capacity ? ' full' : ''}</td>
                        <td>{pct(c.attendance_pct)}</td>
                        <td>{c.filled ? `${Math.round((c.submitted / c.filled) * 100)}%` : '—'}</td>
                        <td>{c.reviewed} of {c.submitted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}
    </AdminShell>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

function Kpi({ v, label, sub, subAccent }: { v: number | string; label: string; sub: string; subAccent?: boolean }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 40 }}>{v}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{label}</div>
      <div className="small" style={{ color: subAccent ? 'var(--color-accent-700)' : 'var(--color-neutral-700)' }}>{sub}</div>
    </div>
  );
}

function Action({ n, title, sub, cta, onClick, first, last }: { n: number; title: string; sub: string; cta: string; onClick?: () => void; first?: boolean; last?: boolean }) {
  return (
    <div style={{ padding: first ? '18px 18px 18px 0' : 18, borderRight: last ? undefined : '1px solid var(--color-divider)' }}>
      <div className="num" style={{ fontSize: 48, color: 'var(--color-accent)' }}>{n}</div>
      <div style={{ fontWeight: 600, fontSize: 16, marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 13, marginBottom: 12 }} className="muted">{sub}</div>
      {onClick && <button type="button" className="btn btn-secondary" onClick={onClick}>{cta}</button>}
    </div>
  );
}
