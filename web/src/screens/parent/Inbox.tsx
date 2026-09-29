import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParentTabs, Phone } from '../../components/shells';
import { ErrorNote, Loading } from '../../components/ui';
import { must, rpc } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateOnly, dayDate, dayMonth, money } from '../../lib/format';
import { supabase } from '../../lib/supabase';

interface Note {
  id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null;
  data: Record<string, unknown>; learner_id: string | null;
}

const ALERT = new Set(['renewal', 'missed_class', 'payment_rejected']);

export default function ParentInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['inbox', profile?.id],
    queryFn: async () => must(await supabase.from('notifications')
      .select('id, kind, title, body, created_at, read_at, data, learner_id')
      .order('created_at', { ascending: false }).limit(50)) as Note[],
  });
  useEffect(() => {
    if (q.data?.some((n) => !n.read_at)) {
      rpc('mark_notifications_read').then(() => qc.invalidateQueries({ queryKey: ['unread'] }));
    }
  }, [q.data, qc]);

  const summary = q.data?.find((n) => n.kind === 'weekly_summary');
  const rest = q.data?.filter((n) => n.kind !== 'weekly_summary') ?? [];

  return (
    <Phone>
      <div className="phone-head">
        <div className="brand">Messages</div>
        <div className="small muted">Also sent on WhatsApp</div>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
        <>
          {summary && <Summary n={summary} />}
          {rest.length === 0 && !summary && <div className="empty">No messages yet.</div>}
          {rest.map((n) => {
            const amount = typeof n.data.amount_minor === 'number' ? money(n.data.amount_minor, (n.data.currency as string) ?? 'NGN') : null;
            return (
              <div key={n.id} className="phone-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
                  <span style={{ fontWeight: 600, color: ALERT.has(n.kind) ? 'var(--color-accent-700)' : 'var(--color-text)' }}>{n.title}</span>
                  <span>{dayDate(n.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, margin: n.kind === 'renewal' ? '4px 0 8px' : '4px 0 0' }}>{n.body}</div>
                {n.kind === 'renewal' && amount && (
                  <button type="button" className="btn btn-primary" onClick={() => navigate(`/signup?renew=${n.data.learner_id ?? n.learner_id}`)}>Pay {amount}</button>
                )}
              </div>
            );
          })}
        </>
      )}
      <ParentTabs />
    </Phone>
  );
}

function Summary({ n }: { n: Note }) {
  const d = n.data as {
    live_attended?: number; live_total?: number; missed?: string; tasks_submitted?: number; tasks_on_time?: number;
    tasks_total?: number; scores?: Record<string, number> | null; coming_up?: string; ends_on?: string | null;
  };
  const scores = d.scores ? Object.entries(d.scores).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v}`).join(' · ') : '—';
  const endsSoon = d.ends_on && (dateOnly(d.ends_on).getTime() - Date.now()) / 864e5 < 14;
  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="kicker-accent" style={{ letterSpacing: '.08em' }}>Weekly summary · {dayDate(n.created_at)}</div>
        <span className="small muted">WhatsApp · Email</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, margin: '6px 0 10px' }}>{n.title}</div>
      <div className="detail-grid" style={{ gridTemplateColumns: 'auto 1fr', gap: '6px 14px', paddingTop: 10 }}>
        <span className="k">Live classes</span>
        <span>{d.live_attended ?? 0} of {d.live_total ?? 0}{d.missed ? ` · missed ${d.missed} (recording sent)` : ''}</span>
        <span className="k">Tasks</span>
        <span>{d.tasks_submitted ?? 0} of {d.tasks_total ?? 0} submitted{d.tasks_on_time === d.tasks_submitted && d.tasks_submitted ? ' on time' : ''}</span>
        <span className="k">Feedback</span><span>{scores}</span>
        {d.coming_up && <><span className="k">Coming up</span><span>{d.coming_up}</span></>}
        {d.ends_on && <><span className="k">Subscription</span>
          <span style={endsSoon ? { color: 'var(--color-accent-700)', fontWeight: 600 } : undefined}>Ends {dayMonth(dateOnly(d.ends_on))}</span></>}
      </div>
    </div>
  );
}
