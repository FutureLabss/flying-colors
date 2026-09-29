import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { must, rpc } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Database } from '../lib/database.types';
import { band, dateOnly, dayDate, dayMonth, daysBetween, LEVEL, longDate, money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { Dialog, ErrorNote, Kicker, Loading, useAction, useToast } from './ui';

type Level = Database['public']['Enums']['learner_level'];
interface TimelineEntry { at: string; kind: string; text: string; actor: string | null }

export function LearnerProfile({ learnerId, manage }: { learnerId: string; manage: boolean }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const office = !!profile && ['owner', 'lead_tutor', 'customer_service'].includes(profile.role);

  const q = useQuery({
    queryKey: ['learner', learnerId],
    queryFn: async () => {
      const l = must(await supabase.from('learners')
        .select('id, code, first_name, last_name, age, level, goals, status, class_id, guardian_id, created_at, pin_set, consent_data, consent_recordings, consent_showcase, needs_review, guardian:profiles!learners_guardian_id_fkey(full_name, phone), cls:classes!learners_class_id_fkey(id, name, age_min, age_max, level, tutor:profiles(display_name))')
        .eq('id', learnerId).single());
      const siblings = must(await supabase.from('learners').select('first_name, last_name, age, cls:classes!learners_class_id_fkey(name)')
        .eq('guardian_id', l.guardian_id).neq('id', learnerId));
      const subs = office ? must(await supabase.from('subscriptions').select('ends_on, status, balance_minor, currency, plans(name, total_minor)')
        .eq('learner_id', learnerId).neq('status', 'pending').order('ends_on', { ascending: false }).limit(1)) : [];
      return { l, siblings, sub: subs[0] ?? null };
    },
  });
  const progress = useQuery({
    queryKey: ['progress', learnerId],
    queryFn: () => rpc<{ attendance_pct: number | null; on_time_pct: number | null; trend: Record<string, number>[] }>('learner_progress', { p_learner: learnerId }),
  });
  const timeline = useQuery({
    queryKey: ['timeline', learnerId],
    queryFn: () => rpc<TimelineEntry[]>('learner_timeline', { p_learner: learnerId }),
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { l, siblings, sub } = q.data!;
  const guardian = l.guardian as unknown as { full_name: string; phone: string | null } | null;
  const cls = l.cls as unknown as { id: string; name: string; age_min: number; age_max: number; level: string; tutor: { display_name: string } | null } | null;
  const plan = sub?.plans as unknown as { name: string; total_minor: number } | null;
  const lastScores = progress.data?.trend.slice(-4) ?? [];
  const avg = lastScores.length
    ? (lastScores.flatMap((s) => Object.values(s)).reduce((a, b) => a + b, 0) / lastScores.flatMap((s) => Object.values(s)).length).toFixed(1) : '—';
  const daysLeft = sub?.ends_on ? daysBetween(dateOnly(sub.ends_on)) : null;
  const phone = guardian?.phone ? `+${guardian.phone.replace(/^(\d{3})(\d{3})(\d{3})(\d+)$/, '$1 $2 $3 $4')}` : '—';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker-accent">Learner · {l.code}</div>
          <h2>{l.first_name} {l.last_name}</h2>
          <div style={{ fontSize: 14 }} className="muted">Age {l.age ?? '—'} · {LEVEL[l.level]} · {cls?.name ?? (l.status === 'exited' ? 'Left' : 'Not placed yet')}</div>
        </div>
        {manage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profile && ['owner', 'lead_tutor'].includes(profile.role) && cls && <button type="button" className="btn btn-secondary" onClick={() => setMoveOpen(true)}>Move class</button>}
            <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(true)}>Edit profile</button>
            {profile && ['owner', 'customer_service'].includes(profile.role) && <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/renewals')}>Renewal</button>}
          </div>
        )}
      </div>
      <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))' }}>
        <div style={{ padding: '20px 28px' }}>
          <Kicker style={{ marginBottom: 8 }}>Record</Kicker>
          <div className="detail-grid" style={{ gridTemplateColumns: '130px 1fr', gap: '8px 16px' }}>
            <span className="k">Guardian</span><span>{guardian?.full_name} · {phone}</span>
            <span className="k">Siblings</span>
            <span>{siblings.length ? siblings.map((s) => `${s.first_name} ${s.last_name}, ${s.age ?? '?'}${(s.cls as unknown as { name: string } | null) ? ` · ${(s.cls as unknown as { name: string }).name}` : ''}`).join('; ') : 'None'}</span>
            <span className="k">Class · tutor</span><span>{cls ? `${cls.name} · ${cls.tutor?.display_name ?? 'No tutor'}` : '—'}</span>
            <span className="k">Registered</span><span>{longDate(l.created_at)}</span>
            <span className="k">Goals</span><span>{l.goals || '—'}</span>
            <span className="k">Consent</span>
            <span>Data {l.consent_data ? '✓' : '✗'} · Recordings {l.consent_recordings ? '✓' : '✗'} · Showcase {l.consent_showcase ? '✓' : '✗'}</span>
            <span className="k">Sign-in</span><span>{l.pin_set ? 'Child PIN set by parent' : 'No PIN yet'}</span>
            {l.needs_review && <><span className="k">Import</span><span style={{ color: 'var(--color-accent-700)', fontWeight: 600 }}>Needs review</span></>}
          </div>
          {office && (
            <>
              <Kicker style={{ margin: '24px 0 8px' }}>Subscription</Kicker>
              {sub ? (
                <Tiles items={[
                  [plan ? money(plan.total_minor, sub.currency) : '—', `${plan?.name ?? 'Plan'} · ${sub.status === 'active' ? 'paid' : sub.status}`],
                  [money(sub.balance_minor, sub.currency), 'Balance'],
                  [sub.ends_on ? dayMonth(dateOnly(sub.ends_on)) : '—', daysLeft == null ? '' : daysLeft < 0 ? `Ended ${-daysLeft} days ago` : daysLeft <= 14 ? `Expiring · ${daysLeft} days` : 'Ends', daysLeft != null && daysLeft <= 14],
                ]} />
              ) : <div className="small muted">No paid plan yet.</div>}
            </>
          )}
          <Kicker style={{ margin: '24px 0 8px' }}>This term</Kicker>
          <Tiles items={[
            [progress.data?.attendance_pct != null ? `${progress.data.attendance_pct}%` : '—', 'Attendance'],
            [progress.data?.on_time_pct != null ? `${progress.data.on_time_pct}%` : '—', 'On-time tasks'],
            [avg, 'Avg rubric'],
          ]} />
        </div>
        <div style={{ padding: '20px 28px' }}>
          <Kicker style={{ marginBottom: 8 }}>Timeline · kept through every class and tutor change</Kicker>
          <div style={{ borderTop: '1px solid var(--color-divider)' }}>
            {timeline.isLoading && <Loading />}
            {timeline.data?.slice(0, 40).map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 100px minmax(0,1fr)', gap: '4px 12px', padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
                <span className="muted">{e.kind === 'Registered' || e.kind === 'Payment' || daysBetween(new Date(), e.at) > 300 ? longDate(e.at) : dayDate(e.at)}</span>
                <span style={{ fontWeight: 600, color: e.kind === 'Feedback' || e.kind === 'Class move' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)' }}>{e.kind}</span>
                <span>{e.text} {e.actor && <span className="muted">· {e.actor}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {moveOpen && cls && <MoveDialog learner={{ id: l.id, first_name: l.first_name, class_id: cls.id }} onClose={() => setMoveOpen(false)} />}
      {editOpen && <EditDialog learner={l} onClose={() => setEditOpen(false)} />}
    </>
  );
}

function Tiles({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid var(--color-divider)' }}>
      {items.map(([v, label, accent], i) => (
        <div key={i} style={{ padding: i === 0 ? '12px 12px 12px 0' : 12, borderRight: i < 2 ? '1px solid var(--color-divider)' : undefined }}>
          <div className="num" style={{ fontSize: 20, color: accent ? 'var(--color-accent)' : undefined }}>{v}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function MoveDialog({ learner, onClose }: { learner: { id: string; first_name: string; class_id: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const act = useAction();
  const toast = useToast();
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('Schedule');
  const classes = useQuery({
    queryKey: ['classes-fill'],
    queryFn: async () => {
      const cls = must(await supabase.from('classes').select('id, name, age_min, age_max, level').order('name'));
      const fill = await rpc<{ class_id: string; filled: number; capacity: number }[]>('class_fill');
      return cls.map((c) => ({ ...c, ...(fill.find((f) => f.class_id === c.id) ?? { filled: 0, capacity: 0 }) }));
    },
  });
  const opts = classes.data?.filter((c) => c.id !== learner.class_id) ?? [];
  const pickable = opts.find((c) => c.filled < c.capacity);
  const sel = to ?? pickable?.id ?? null;
  const pron = learner.first_name;

  return (
    <Dialog title={`Move ${pron} to another class`} body="Their submissions, feedback and attendance move with them. The new tutor sees their full history." onClose={onClose}>
      {classes.isLoading && <Loading />}
      {opts.map((c) => {
        const seats = c.capacity - c.filled;
        const full = seats <= 0;
        const on = c.id === sel;
        return (
          <button key={c.id} type="button" aria-pressed={on} aria-disabled={full}
            onClick={() => (full ? toast(`${c.name} is full. Add ${pron} to its waitlist from the placement queue.`) : setTo(c.id))}
            style={{ textAlign: 'left', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`, borderRadius: 18,
              background: on ? 'var(--color-accent-100)' : 'transparent', padding: '10px 12px', cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.45 : 1 }}>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div className="small muted">{band(c)} · {full ? 'Full · join waitlist instead' : `${seats} seat${seats === 1 ? '' : 's'} left`}</div>
          </button>
        );
      })}
      <div className="field"><label htmlFor="move-reason">Reason</label>
        <select id="move-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Schedule', 'Level up', 'Level down', 'Parent request'].map((r) => <option key={r}>{r}</option>)}
        </select></div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!sel}
          onClick={() => act(async () => {
            await rpc('move_learner', { p_learner: learner.id, p_class: sel!, p_reason: reason });
            await qc.invalidateQueries();
            onClose();
          }, `${pron} moved to ${opts.find((c) => c.id === sel)?.name}. History kept; new tutor and parent notified.`)}>Move learner</button>
      </div>
    </Dialog>
  );
}

function EditDialog({ learner, onClose }: { learner: { id: string; first_name: string; age: number | null; level: Level; goals: string; consent_showcase: boolean }; onClose: () => void }) {
  const [age, setAge] = useState(learner.age ?? 8);
  const [level, setLevel] = useState<Level>(learner.level);
  const [goals, setGoals] = useState(learner.goals);
  const [showcase, setShowcase] = useState(learner.consent_showcase);
  const act = useAction();
  const qc = useQueryClient();
  return (
    <Dialog title={`Edit ${learner.first_name}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <div className="field"><label htmlFor="e-age">Age</label>
          <input id="e-age" className="input" type="number" min={4} max={16} value={age} onChange={(e) => setAge(+e.target.value)} /></div>
        <div className="field"><label htmlFor="e-level">Level</label>
          <select id="e-level" className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
      </div>
      <div className="field"><label htmlFor="e-goals">Goals</label><textarea id="e-goals" className="input" value={goals} onChange={(e) => setGoals(e.target.value)} /></div>
      <label style={{ display: 'flex', gap: 10, fontSize: 13 }}>
        <input type="checkbox" checked={showcase} onChange={(e) => setShowcase(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
        Parent agreed to showcase use of videos
      </label>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => act(async () => {
          await rpc('update_learner', { p_learner: learner.id, p_age: age, p_level: level, p_goals: goals, p_showcase: showcase });
          await qc.invalidateQueries({ queryKey: ['learner', learner.id] });
          onClose();
        }, 'Saved.')}>Save</button>
      </div>
    </Dialog>
  );
}
