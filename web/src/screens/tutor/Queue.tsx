import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TutorShell } from '../../components/shells';
import { Dialog, ErrorNote, Loading, Pills, useAction } from '../../components/ui';
import { rpc } from '../../lib/api';
import { dayMonth, dayTime, duration, LEVEL, time, weekday, weekdayLong } from '../../lib/format';
import { rowStatus, STATUS_TAG, useQueue, type QueueData } from './data';

type Filter = 'todo' | 'all' | 'missing' | 'done';

export default function TutorQueue() {
  const { classId } = useParams();
  const q = useQueue(classId);
  const [filter, setFilter] = useState<Filter>('todo');
  const [noteOpen, setNoteOpen] = useState(false);
  const navigate = useNavigate();
  const act = useAction();
  const qc = useQueryClient();

  if (q.isLoading) return <TutorShell><Loading /></TutorShell>;
  if (q.error || !q.data?.class) return <TutorShell><ErrorNote error={q.error ?? new Error('Class not found')} /></TutorShell>;
  const d = q.data;
  const c = d.class!;
  const rows = d.rows.map((r) => ({ ...r, status: rowStatus(r) }));
  const submitted = rows.filter((r) => r.submission_id);
  const nRev = rows.filter((r) => r.status === 'Reviewed').length;
  const nMiss = rows.filter((r) => r.status === 'Missing').length;
  const nTodo = submitted.length - nRev;
  const shown = rows.filter((r) =>
    filter === 'all' || (filter === 'todo' && r.submission_id && r.status !== 'Reviewed')
    || (filter === 'missing' && r.status === 'Missing') || (filter === 'done' && r.status === 'Reviewed'));
  const today = `${d.week.today}T12:00:00Z`;

  return (
    <TutorShell>
      <div className="page-head" style={{ gap: 24 }}>
        <div>
          <div className="kicker-accent">{weekdayLong(today)} {dayMonth(today)} · {['Tue', 'Fri'].includes(weekday(today)) ? 'correction day · ' : ''}week {d.week.week}</div>
          <h2>{c.name}</h2>
          <div style={{ fontSize: 14 }} className="muted">Ages {c.age_min}–{c.age_max} · {LEVEL[c.level]} · {d.filled} learners · Zoom {c.live_schedule.replace(' · 5:00–6:00 pm WAT', ' 5 pm')}</div>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Stat v={nTodo} label="to review" />
          <Stat v={nRev} label="reviewed" />
          <Stat v={nMiss} label="missing" accent />
          <Stat v="6 pm" label="feedback release" />
        </div>
      </div>
      <WeekStrip d={d} reviewed={nRev} submitted={submitted.length} />
      <div className="pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Pills value={filter} onChange={setFilter} options={[
            ['todo', `To review · ${nTodo}`], ['all', `All · ${rows.length}`], ['missing', `Missing · ${nMiss}`], ['done', `Reviewed · ${nRev}`],
          ] as const} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {d.task && <div style={{ fontSize: 13 }} className="muted">Task: {d.task.title} · {d.task.response_type} · due {dayTime(d.task.due_at)}</div>}
            <button type="button" className="btn btn-secondary" onClick={() => setNoteOpen(true)}>Class correction note</button>
          </div>
        </div>
        {!d.task ? <div className="empty">No task has been released for this class yet.</div> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Learner</th><th>Submitted</th><th>Length</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={5} className="muted">Nothing here. {filter === 'todo' ? 'Every submission is reviewed.' : ''}</td></tr>}
                {shown.map((r) => {
                  const miss = r.status === 'Missing';
                  const done = r.status === 'Reviewed';
                  return (
                    <tr key={r.id}>
                      <td><div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div><div className="small muted">Age {r.age ?? '—'}</div></td>
                      <td>{r.submitted_at ? dayTime(r.submitted_at) : '—'}</td>
                      <td>{r.submission_id ? duration(r.duration_seconds) : '—'}</td>
                      <td><span className={`tag ${STATUS_TAG[r.status]}`}>{r.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className={`btn ${miss || done ? '' : 'btn-ink'}`} disabled={miss && !!r.nudged_at}
                          style={{ border: '1px solid var(--color-divider)', minWidth: 120, justifyContent: 'flex-start' }}
                          onClick={() => miss
                            ? act(async () => { await rpc('nudge_parent', { p_task: d.task!.id, p_learner: r.id }); await qc.invalidateQueries({ queryKey: ['queue', classId] }); }, `WhatsApp reminder sent to ${r.first_name}’s parent`)
                            : navigate(`/tutor/c/${classId}/review/${r.submission_id}`)}>
                          {miss ? (r.nudged_at ? `Nudged ${time(r.nudged_at)}` : 'Nudge parent') : done ? 'Open' : 'Review'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {noteOpen && <CorrectionNote classId={c.id} className={c.name} task={d.task?.title} onClose={() => setNoteOpen(false)} />}
    </TutorShell>
  );
}

function Stat({ v, label, accent }: { v: number | string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 32, color: accent ? 'var(--color-accent)' : undefined }}>{v}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function WeekStrip({ d, reviewed, submitted }: { d: QueueData; reviewed: number; submitted: number }) {
  const monday = new Date(`${d.week.monday}T12:00:00Z`);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + (i - 2) * 864e5));
  const key = (x: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(x));
  const todayKey = d.week.today;
  const now = Date.now();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', borderBottom: '1px solid var(--color-divider)', overflowX: 'auto' }}>
      {days.map((day, i) => {
        const k = key(day);
        const isToday = k === todayKey;
        const dow = weekday(day);
        const ses = d.sessions.find((s) => key(s.starts_at) === k);
        const released = d.tasks.find((t) => key(t.release_at) === k);
        const dueHere = d.tasks.find((t) => key(t.due_at) === k);
        let title = ''; let sub = ''; let subAccent = false;
        if (ses) {
          title = 'Live class';
          if (new Date(ses.starts_at).getTime() > now) sub = time(ses.starts_at);
          else if (!ses.register_saved_at) { sub = 'Register not saved'; subAccent = true; }
          else if (ses.absent > 0) { sub = `${ses.absent} absent · follow-up sent`; subAccent = true; }
          else sub = `${ses.present}/${ses.present + ses.absent} present${ses.recording_attached_at ? ' · ✓ rec' : ''}`;
          if (ses.register_saved_at && ses.absent > 0 && ses.recording_attached_at) sub += ' · ✓ rec';
        } else if (dow === 'Tue' || dow === 'Fri') {
          title = 'Corrections';
          if (isToday) sub = `${reviewed} of ${submitted} done`;
        } else if (released) {
          title = new Date(released.release_at).getTime() > now ? 'Task scheduled' : 'Task released';
          sub = new Date(released.release_at).getTime() > now ? `${released.title} · ${time(released.release_at)}` : released.title;
        } else if (dueHere) {
          sub = `Deadline ${time(dueHere.due_at)}`;
        }
        return (
          <div key={k} style={{ padding: '12px 14px', borderRight: i < 6 ? '1px solid var(--color-divider)' : undefined, minWidth: 110,
            ...(isToday ? { background: 'var(--color-accent)', color: '#fff' } : {}) }}>
            <div style={{ fontSize: 11, color: isToday ? undefined : 'var(--color-neutral-700)' }}>{dow.toUpperCase()} {day.getUTCDate()}{isToday ? ' · TODAY' : ''}</div>
            {title && <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>}
            {sub && <div style={{ fontSize: 12, color: isToday ? undefined : subAccent ? 'var(--color-accent-700)' : 'var(--color-neutral-700)' }}>{sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

function CorrectionNote({ classId, className, task, onClose }: { classId: string; className: string; task?: string; onClose: () => void }) {
  const [msg, setMsg] = useState(task ? `A tip for everyone after “${task}”: ` : '');
  const act = useAction();
  return (
    <Dialog title="Class correction note" body={`Goes to every family in ${className} by WhatsApp and in the app. Use it for mistakes many learners made.`} onClose={onClose}>
      <textarea className="input" style={{ minHeight: 120 }} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Note" />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={msg.trim().length < 10}
          onClick={() => act(async () => {
            const r = await rpc<{ reach: number }>('send_announcement', { p_audience: 'class', p_class: classId, p_message: msg, p_channels: ['whatsapp', 'app'] });
            onClose();
            return r;
          }, (r) => `Note sent to ${r.reach} families in ${className}.`)}>Send note</button>
      </div>
    </Dialog>
  );
}
