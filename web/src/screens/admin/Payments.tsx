import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Loading, useAction } from '../../components/ui';
import { must, rpc, signedUrl } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { supabase } from '../../lib/supabase';

const alertText = (p: { bank_alert: string | null; amount_minor: number; currency: string; bank_alert_amount_minor: number | null }) =>
  p.bank_alert === 'matched' ? `Bank alert matched · ${money(p.amount_minor, p.currency)}`
    : p.bank_alert === 'amount_differs' ? `Amount differs · ${money(p.bank_alert_amount_minor, p.currency)} received`
    : 'No bank alert found yet';

const STATUS: Record<string, [string, string]> = {
  pending_review: ['Pending', 'tag-grey'], approved: ['Approved', 'tag-ink'], rejected: ['Rejected', 'tag-violet'],
};

export default function AdminPayments() {
  const [sel, setSel] = useState<string | null>(null);
  const act = useAction();
  const qc = useQueryClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();

  const q = useQuery({
    queryKey: ['payments-queue'],
    queryFn: async () => {
      const rows = must(await supabase.from('payments')
        .select('id, description, amount_minor, currency, bank, reference, receipt_path, bank_alert, bank_alert_amount_minor, status, sent_at, decided_at, learner:learners(first_name, last_name), guardian:profiles!payments_guardian_id_fkey(display_name, full_name)')
        .eq('method', 'transfer').neq('provider', 'import')
        .or(`status.eq.pending_review,and(status.in.(approved,rejected),decided_at.gte.${since})`)
        .order('sent_at'));
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
      const start = new Date(`${today}T00:00:00+01:00`).toISOString();
      const { count: auto } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'auto_verified').gte('decided_at', start);
      const { count: rev } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'reversed').gte('decided_at', start);
      return { rows, auto: auto ?? 0, rev: rev ?? 0 };
    },
  });

  const rows = q.data?.rows ?? [];
  const pending = rows.filter((r) => r.status === 'pending_review');
  const sp = rows.find((r) => r.id === sel) ?? pending[0] ?? rows[0];
  const receipt = useQuery({
    queryKey: ['receipt', sp?.receipt_path],
    enabled: !!sp?.receipt_path,
    queryFn: () => signedUrl('receipts', sp!.receipt_path),
  });
  const name = (r: typeof rows[number]) => {
    const g = r.guardian as unknown as { display_name: string; full_name: string } | null;
    return g?.display_name || g?.full_name || '—';
  };
  const learner = (r: typeof rows[number]) => {
    const l = r.learner as unknown as { first_name: string; last_name: string } | null;
    return l ? `${l.first_name} ${l.last_name}` : '—';
  };

  const decide = (approve: boolean) => sp && act(async () => {
    await rpc('decide_payment', { p_payment: sp.id, p_approve: approve });
    const next = pending.find((p) => p.id !== sp.id);
    if (next) setSel(next.id);
    await qc.invalidateQueries({ queryKey: ['payments-queue'] });
    await qc.invalidateQueries({ queryKey: ['admin-counts'] });
  }, approve ? `Approved. ${learner(sp).split(' ')[0]} moves to the placement queue; receipt sent to ${name(sp)}.` : `Rejected. ${name(sp)} asked to resend proof on WhatsApp.`);

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">Bank transfers</div><h2>Payment approvals · {pending.length} pending</h2></div>
        {q.data && <div style={{ fontSize: 13 }} className="muted">Today: {q.data.auto} Paystack payment{q.data.auto === 1 ? '' : 's'} auto-verified · {q.data.rev} reversal{q.data.rev === 1 ? '' : 's'} flagged</div>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : !sp ? <div className="empty">No bank transfers waiting. Card payments confirm themselves.</div> : (
        <div className="collapse-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
          <div className="table-scroll" style={{ borderRight: '1px solid var(--color-divider)', padding: '0 28px' }}>
            <table className="table">
              <thead><tr><th>Guardian · learner</th><th>Amount</th><th>Sent</th><th>Bank alert</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`clickable${r.id === sp.id ? ' selected' : ''}`} onClick={() => setSel(r.id)}>
                    <td><div style={{ fontWeight: 600 }}>{name(r)}</div><div className="small muted">{learner(r)} · {r.description}</div></td>
                    <td style={{ fontWeight: 600 }}>{money(r.amount_minor, r.currency)}</td>
                    <td style={{ fontSize: 13 }}>{r.sent_at ? dateTime(r.sent_at) : '—'}</td>
                    <td style={{ fontSize: 13 }}>{alertText(r)}</td>
                    <td><span className={`tag ${STATUS[r.status]?.[1] ?? 'tag-grey'}`}>{STATUS[r.status]?.[0] ?? r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0 }}>{name(sp)}</h3>
            <div className="detail-grid" style={{ gridTemplateColumns: '110px 1fr' }}>
              <span className="k">Learner</span><span>{learner(sp)}</span>
              <span className="k">Plan</span><span>{sp.description}</span>
              <span className="k">Amount</span><span style={{ fontWeight: 600 }}>{money(sp.amount_minor, sp.currency)}</span>
              <span className="k">Bank · ref</span><span>{sp.bank ?? '—'} · {sp.reference}</span>
            </div>
            <div style={{ aspectRatio: '3 / 4', maxHeight: 320, background: 'var(--color-surface)', border: '1px dashed var(--color-neutral-400)', borderRadius: 20, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 12, fontSize: 12 }} className="muted">
              {receipt.data && (/\.pdf$/i.test(sp.receipt_path ?? '')
                ? <a href={receipt.data} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600 }}>Open receipt (PDF)</a>
                : <a href={receipt.data} target="_blank" rel="noopener noreferrer"><img src={receipt.data} alt="Receipt" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} /></a>)}
              <span style={{ position: 'relative', background: 'var(--color-surface)', borderRadius: 8, padding: '2px 6px' }}>
                {sp.receipt_path ? `Receipt uploaded by parent · ${sp.sent_at ? dateTime(sp.sent_at) : ''}` : 'No receipt uploaded — check the bank alert'}
              </span>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', borderRadius: 14, fontSize: 14, fontWeight: 600 }}>{alertText(sp)}</div>
            {sp.status === 'pending_review' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                <button type="button" className="btn btn-primary" style={{ minHeight: 48, justifyContent: 'flex-start' }} onClick={() => decide(true)}>Approve payment</button>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 48, justifyContent: 'flex-start' }} onClick={() => decide(false)}>Reject · ask again</button>
              </div>
            ) : <div style={{ fontSize: 14 }} className="muted">Decision logged to the audit trail.</div>}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
