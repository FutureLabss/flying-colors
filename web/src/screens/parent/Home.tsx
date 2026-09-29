import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ParentTabs, Phone } from '../../components/shells';
import { ErrorNote, Loading, useToast } from '../../components/ui';
import { rpc } from '../../lib/api';
import {
  clock, correctionRelease, dateOnly, dayMonth, dayTime, daysBetween, focusTag, hoursLeft, longDate, time, weekday,
  weekdayLong, whenDay,
} from '../../lib/format';
import { AccountMenu, useSelectedChild, type Child } from './common';

export interface ParentHomeData {
  learner: { id: string; first_name: string; age: number; status: string; level: string } | null;
  class: { id: string; name: string; tutor_name: string | null; zoom_url: string | null } | null;
  task: { id: string; title: string; response_type: string; release_at: string; due_at: string } | null;
  submission: { submitted_at: string; duration_seconds: number | null } | null;
  feedback: { id: string; written: string; scores: Record<string, number>; tags: string[]; tutor_name: string | null;
    task_title: string; release_at: string; voice_note_seconds: number | null } | null;
  pending_feedback_at: string | null;
  attendance: ('present' | 'late' | 'absent')[];
  next_live: string | null;
  recording: { starts_at: string; url: string | null } | null;
  subscription: { plan_name: string; price_label: string; total_minor: number; currency: string; ends_on: string;
    status: string; balance_minor: number } | null;
  week: { week: number; today: string; monday: string; sunday: string };
}

const WEEK = [['Mon', 'Task'], ['Tue', 'Fdbk'], ['Wed', 'Task'], ['Thu', ''], ['Fri', 'Fdbk'], ['Sat', 'Live'], ['Sun', 'Live']] as const;

function headline(name: string, d: ParentHomeData): string {
  const l = d.learner;
  if (l?.status === 'awaiting_payment') return `Finish paying to hold ${name}’s place.`;
  if (l?.status === 'awaiting_placement') return `We’re placing ${name} in a class. Usually within 48 hours.`;
  const t = d.task;
  if (!t) return `No task for ${name} yet this week.`;
  const slot = weekday(t.release_at) === 'Mon' ? 'Monday’s' : `${weekdayLong(t.release_at)}’s`;
  if (d.submission) {
    const at = d.pending_feedback_at ?? correctionRelease(t.due_at).toISOString();
    if (d.feedback && d.feedback.task_title === t.title) return `${name}’s feedback on ${slot} task is ready.`;
    return `${name} submitted ${slot} task. Feedback arrives ${whenDay(at)} at ${time(at)}.`;
  }
  if (new Date(t.due_at) > new Date()) return `${name} hasn’t sent ${slot} task yet. It’s due ${whenDay(t.due_at)} at ${time(t.due_at)}.`;
  return `${name} missed ${slot} task. The next one opens soon.`;
}

export default function ParentHome() {
  const { children, child, select, isLoading } = useSelectedChild();
  const q = useQuery({
    queryKey: ['parent-home', child?.id],
    enabled: !!child,
    queryFn: () => rpc<ParentHomeData>('parent_home', { p_learner: child!.id }),
  });
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <Phone>
      <div className="phone-head">
        <div className="brand">Flying Colours</div>
        <AccountMenu />
      </div>
      <ChildTabs kids={children} selected={child?.id} onSelect={select} />
      {isLoading || (child && q.isLoading) ? <Loading /> : !child ? (
        <div style={{ padding: '24px 16px' }}>
          <h2 style={{ fontSize: 26 }}>Welcome!</h2>
          <p>Enrol your first child to get started.</p>
          <Link className="btn btn-primary" to="/signup?add=1">Enrol a child</Link>
        </div>
      ) : q.error ? <ErrorNote error={q.error} /> : q.data && (
        <HomeBody d={q.data} child={child}
          onRenew={() => navigate(`/signup?renew=${child.id}`)}
          onRecording={() => q.data.recording?.url ? window.open(q.data.recording.url, '_blank', 'noopener') : toast('No recording yet for this class.')} />
      )}
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="small muted">Weekly summary goes to WhatsApp every Sunday.</div>
        <Link className="btn btn-secondary" style={{ flex: "none" }} to="/signup?add=1">Add a child</Link>
      </div>
      <ParentTabs />
    </Phone>
  );
}

export function ChildTabs({ kids, selected, onSelect }: { kids: Child[]; selected?: string; onSelect: (id: string) => void }) {
  if (kids.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(2, kids.length)},1fr)`, borderBottom: '1px solid var(--color-divider)' }} role="tablist">
      {kids.map((c) => {
        const on = c.id === selected;
        return (
          <button key={c.id} role="tab" aria-selected={on} type="button" onClick={() => onSelect(c.id)}
            style={{ textAlign: 'left', background: 'transparent', border: 0, borderBottom: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, padding: '12px 16px', cursor: 'pointer', minHeight: 56 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: on ? 'var(--color-text)' : 'var(--color-neutral-700)' }}>{c.first_name}{c.age ? `, ${c.age}` : ''}</div>
            <div className="small muted">{c.class_name ?? 'Starting soon'}</div>
          </button>
        );
      })}
    </div>
  );
}

function HomeBody({ d, child, onRenew, onRecording }: { d: ParentHomeData; child: Child; onRenew: () => void; onRecording: () => void }) {
  const name = child.first_name;
  const todayIdx = (new Date(`${d.week.today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const att = d.attendance;
  const counts = { present: att.filter((a) => a === 'present').length, late: att.filter((a) => a === 'late').length, absent: att.filter((a) => a === 'absent').length };
  const sub = d.subscription;
  const daysLeft = sub ? daysBetween(dateOnly(sub.ends_on)) : null;
  const expiring = daysLeft != null && daysLeft <= 14;
  const due = d.task ? hoursLeft(d.task.due_at) : null;

  return (
    <>
      <div style={{ padding: '20px 16px 16px' }}>
        <div className="kicker-accent">{weekdayLong(`${d.week.today}T12:00:00Z`)} · Week {d.week.week} · {dayMonth(`${d.week.monday}T12:00:00Z`)} – {dayMonth(`${d.week.sunday}T12:00:00Z`)}</div>
        <h2 style={{ fontSize: 26, margin: '6px 0 16px', textWrap: 'pretty' }}>{headline(name, d)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)' }}>
          {WEEK.map(([day, what], i) => (
            <div key={day} style={{ padding: '8px 4px', borderRight: i < 6 && i !== todayIdx ? '1px solid var(--color-divider)' : undefined,
              ...(i === todayIdx ? { background: 'var(--color-accent)', color: '#fff' } : {}) }}>
              <div style={{ fontSize: 11, color: i === todayIdx ? undefined : 'var(--color-neutral-700)' }}>{day}</div>
              {what && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{what}</div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {d.task && (
          <div className="phone-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
            <div className="kicker">{weekdayLong(d.task.release_at)} task · due {dayTime(d.task.due_at)}</div>
            <span className={`tag ${d.submission ? 'tag-grey' : 'tag-violet'}`}>{d.submission ? 'Submitted' : due != null && due < 0 ? 'Missed' : 'Not submitted'}</span>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{d.task.title} — {d.task.response_type}</div>
            <div className="small muted">{d.submission ? dayTime(d.submission.submitted_at) : due != null && due >= 0 ? `Due in ${due} h` : ''}</div>
          </div>
        )}
        {d.feedback && (
          <div className="phone-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
            <div className="kicker">Latest feedback · {weekday(d.feedback.release_at)}</div>
            {focusTag(d.feedback.scores, d.feedback.tags) ? <span className="tag tag-accent">{focusTag(d.feedback.scores, d.feedback.tags)}/5</span> : <span />}
            <div style={{ fontSize: 14, lineHeight: 1.45, gridColumn: '1 / -1' }}>
              {d.feedback.written ? `“${d.feedback.written}”` : `Feedback on “${d.feedback.task_title}”`}{d.feedback.tutor_name ? ` — ${d.feedback.tutor_name}` : ''}
            </div>
          </div>
        )}
        {d.class && (
          <div className="phone-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', alignItems: 'center' }}>
            <div className="kicker">Next live class · Zoom</div><div />
            <div style={{ fontWeight: 600, fontSize: 16 }}>{d.next_live ? `${weekday(d.next_live)} ${dayMonth(d.next_live)} · ${clock(d.next_live)} WAT` : 'Timetable coming soon'}</div>
            <button type="button" className="btn btn-ghost" onClick={onRecording}>Last recording</button>
          </div>
        )}
        {att.length > 0 && (
          <div className="phone-row">
            <div className="kicker" style={{ marginBottom: 8 }}>Attendance · last {att.length} classes</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {att.map((a, i) => (
                <div key={i} title={a} style={{ width: 26, height: 26, borderRadius: '50%',
                  background: a === 'present' ? 'var(--color-text)' : a === 'late' ? 'var(--color-neutral-500)' : 'transparent',
                  border: `2px solid ${a === 'absent' ? 'var(--color-accent)' : a === 'present' ? 'var(--color-text)' : 'var(--color-neutral-500)'}` }} />
              ))}
              <div className="small muted" style={{ marginLeft: 6 }}>
                {counts.late + counts.absent === 0 ? `${counts.present} of ${att.length} present`
                  : [`${counts.present} present`, counts.late && `${counts.late} late`, counts.absent && `${counts.absent} absent`].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        )}
      </div>
      {sub && (
        <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 28, margin: 12, padding: 18, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
          <div>
            <div className="kicker" style={{ color: 'var(--lime)' }}>{daysLeft! < 0 ? 'Subscription ended' : expiring ? 'Subscription expiring' : 'Subscription active'}</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>
              {daysLeft! < 0 ? `Ended ${dayMonth(dateOnly(sub.ends_on))}` : expiring ? `Ends ${dayMonth(dateOnly(sub.ends_on))} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : `Ends ${longDate(dateOnly(sub.ends_on))}`}
            </div>
            <div className="small" style={{ color: 'var(--color-neutral-400)' }}>
              {sub.plan_name} plan · {sub.balance_minor > 0 ? `balance due` : expiring || daysLeft! < 0 ? sub.price_label : 'paid in full'}
            </div>
          </div>
          {(expiring || daysLeft! < 0) && (
            <button type="button" className="btn btn-lime" style={{ minHeight: 44 }} onClick={onRenew}>Renew now ↗</button>
          )}
        </div>
      )}
    </>
  );
}
