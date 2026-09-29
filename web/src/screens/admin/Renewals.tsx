import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Loading, Pills, useAction } from '../../components/ui';
import { rpc } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { dateOnly, dayDate, daysBetween, money } from '../../lib/format';
import { downloadCsv } from './csv';

type Outcome = Database['public']['Enums']['renewal_outcome'];
type Group = 'expiring' | 'expired' | 'arrears';
interface Row {
  subscription_id: string; learner_id: string; learner: string; guardian: string; plan: string; ends_on: string; grp: Group;
  days_left: number; balance_minor: number; currency: string; next_instalment_due: string | null; grace_until: string | null;
  status: string; outcome: Outcome | null; reminders: string[];
}

const TABS: [Group, string][] = [['expiring', 'Expiring ≤ 7 days'], ['expired', 'Expired'], ['arrears', 'In arrears']];
const OUT: Record<Outcome, [string, string]> = { renewed: ['Renewed', 'var(--color-text)'], grace: ['Grace · 7 days', 'var(--color-neutral-600)'], exit: ['Exited', 'var(--color-accent)'] };

function statusText(r: Row) {
  if (r.grp === 'arrears' && r.next_instalment_due) return `Instalment overdue ${daysBetween(new Date(), dateOnly(r.next_instalment_due))} days`;
  if (r.grace_until && r.status === 'grace') return `Grace ends ${dayDate(dateOnly(r.grace_until))}`;
  if (r.days_left < 0) return `Ended ${-r.days_left} day${r.days_left === -1 ? '' : 's'} ago`;
  if (r.days_left === 0) return 'Ends today';
  return `${r.days_left} day${r.days_left === 1 ? '' : 's'}`;
}

function remindersText(k: string[]) {
  if (!k.length) return 'None yet';
  const calls = k.filter((x) => x === 'call').length;
  const inst = k.filter((x) => x === 'instalment').length;
  const named = k.filter((x) => ['7d', '3d', 'expiry'].includes(x)).map((x) => ({ '7d': '7-day', '3d': '3-day', expiry: 'Expiry' }[x]));
  return [named.length ? `${named.join(', ')} sent` : '', inst ? `${inst} reminder${inst === 1 ? '' : 's'}` : '', calls ? `${calls} call${calls === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(' · ');
}

const endsText = (r: Row) => {
  const d = dateOnly(r.ends_on);
  return Math.abs(daysBetween(d)) > 60 ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(d) : dayDate(d);
};

export default function AdminRenewals() {
  const [tab, setTab] = useState<Group>('expiring');
  const act = useAction();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['renewals'], queryFn: () => rpc<Row[]>('renewal_queue') });
  const rows = q.data ?? [];
  const open = rows.filter((r) => !r.outcome);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['renewals'] });
    await qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };
  const setOutcome = (r: Row, o: Outcome) => act(async () => { await rpc('set_renewal_outcome', { p_subscription: r.subscription_id, p_outcome: o }); await refresh(); },
    o === 'exit' ? `${r.learner} exited. Removed from class roster; history kept.` : o === 'renewed' ? `${r.learner} marked renewed. Subscription extended 12 months.` : `${r.learner} given a 7-day grace period.`);

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">Subscriptions</div><h2>Renewals · {open.length} to follow up</h2></div>
        <div style={{ fontSize: 13 }} className="muted">Reminders go out automatically at 7 days, 3 days and on expiry.</div>
      </div>
      <div className="pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Pills value={tab} onChange={setTab} options={TABS.map(([id, label]) => [id, `${label} · ${open.filter((r) => r.grp === id).length}`] as const)} />
          <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(`renewals-${tab}`, rows.filter((r) => r.grp === tab).map((r) => ({
            Learner: r.learner, Guardian: r.guardian, Plan: r.plan, Ends: r.ends_on, Status: statusText(r), Balance: money(r.balance_minor, r.currency),
            Reminders: remindersText(r.reminders), Outcome: r.outcome ?? '',
          })))}>Export list</button>
        </div>
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Learner · guardian</th><th>Plan</th><th>Ends</th><th>Status</th><th>Balance</th><th>Reminders</th><th>Outcome</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.grp === tab).length === 0 && <tr><td colSpan={7} className="muted">Nobody here.</td></tr>}
                {rows.filter((r) => r.grp === tab).map((r) => (
                  <tr key={r.subscription_id}>
                    <td><div style={{ fontWeight: 600 }}>{r.learner}</div><div className="small muted">{r.guardian}</div></td>
                    <td>{r.plan}</td>
                    <td>{endsText(r)}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>{statusText(r)}</td>
                    <td>{money(r.balance_minor, r.currency)}</td>
                    <td style={{ fontSize: 13 }}>{remindersText(r.reminders)}</td>
                    <td>
                      {r.outcome ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="tag" style={{ background: OUT[r.outcome][1], color: '#fff' }}>{OUT[r.outcome][0]}</span>
                          <button type="button" className="btn btn-ghost" onClick={() => act(async () => { await rpc('clear_renewal_outcome', { p_subscription: r.subscription_id }); await refresh(); })}>Undo</button>
                        </div>
                      ) : (
                        <div className="pills">
                          <button type="button" onClick={() => setOutcome(r, 'renewed')} style={{ fontWeight: 400, padding: '6px 10px' }}>Renewed</button>
                          <button type="button" onClick={() => setOutcome(r, 'grace')} style={{ fontWeight: 400, padding: '6px 10px' }}>Grace</button>
                          <button type="button" onClick={() => setOutcome(r, 'exit')} style={{ padding: '6px 10px', color: 'var(--color-accent-700)' }}>Exit</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
