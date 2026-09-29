import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from '../../components/shells';
import { ErrorNote, Loading, PauseIcon, PlayIcon, useAction, useToast } from '../../components/ui';
import { rpc, signedUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { correctionRelease, dayMonth, duration, hoursLeft, time, weekday, weekdayLong } from '../../lib/format';

export interface LearnerWeekData {
  learner: { id: string; first_name: string; guardian_id: string } | null;
  class: { id: string; name: string; tutor_name: string | null; zoom_url: string | null } | null;
  feedback: { id: string; written: string; scores: Record<string, number>; task_title: string; response_type: string;
    voice_note_path: string | null; voice_note_seconds: number | null; seen_at: string | null; tutor_name: string | null } | null;
  task: { id: string; title: string; instructions: string; steps: string[]; response_type: string;
    attachments: { name: string; path?: string }[]; release_at: string; due_at: string } | null;
  submission: { id: string; submitted_at: string } | null;
  done_days: string[];
  next_live: string | null;
  recording: { starts_at: string; url: string | null } | null;
  week: { week: number; today: string; monday: string; sunday: string };
}

export const useLearnerWeek = () => useQuery({ queryKey: ['learner-week'], queryFn: () => rpc<LearnerWeekData>('learner_week') });

const SKILL_LABEL: Record<string, string> = { pronunciation: 'Speaking', grammar: 'Grammar', fluency: 'Fluency', confidence: 'Confidence' };
const WAVE = [8, 14, 10, 18, 12, 6, 16, 10, 14, 8, 12, 6];
const noun = (t: string) => ({ video: 'video', audio: 'recording', photo: 'photo', text: 'answer' }[t] ?? 'work');

export default function LearnerWeek() {
  const q = useLearnerWeek();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  if (q.isLoading) return <Phone><Loading /></Phone>;
  if (q.error || !q.data?.learner) return <Phone><ErrorNote error={q.error ?? new Error('No learner record')} /></Phone>;
  const d = q.data;
  const name = d.learner!.first_name;
  const todayIdx = (new Date(`${d.week.today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const doneIdx = new Set(d.done_days.map((x) => (new Date(`${x}T12:00:00Z`).getUTCDay() + 6) % 7));
  const locked = !!d.feedback && !d.feedback.seen_at;
  const zoom = d.class?.zoom_url ? (d.class.zoom_url.startsWith('http') ? d.class.zoom_url : `https://${d.class.zoom_url.replace(/\s/g, '')}`) : null;

  return (
    <Phone>
      <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '18px 16px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -80, top: -50, width: 240, height: 240, borderRadius: '50%', background: 'var(--lime)' }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,.18)', padding: '6px 12px', borderRadius: 999 }}>{d.class?.name ?? 'Starting soon'}</div>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-accent-800)', display: 'grid', placeItems: 'center', font: '600 20px/1 var(--font-heading)' }}>{name[0]}</div>
        </div>
        <h1 style={{ position: 'relative', font: '600 64px/0.95 var(--font-heading)', letterSpacing: '-.045em', margin: '22px 0 8px', color: '#fff' }}>
          Hi <span className="ring">{name}!</span>
        </h1>
        <div style={{ position: 'relative', fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{weekdayLong(`${d.week.today}T12:00:00Z`)} · here’s your week</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid rgba(255,255,255,.35)', margin: '0 -16px', position: 'relative' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
            <div key={i} style={{ padding: '8px 6px', fontSize: 12, fontWeight: 600,
              ...(i === todayIdx ? { background: '#fff', color: 'var(--color-accent)' } : { borderRight: i < 6 ? '1px solid var(--color-accent-400)' : undefined }) }}>
              {l}
              {i === todayIdx ? <div style={{ fontSize: 18 }}>●</div>
                : doneIdx.has(i) ? <div style={{ fontSize: 18 }}>✓</div>
                : i >= 5 ? <div style={{ fontSize: 11 }}>Live</div> : null}
            </div>
          ))}
        </div>
      </div>

      {d.feedback && <FeedbackBlock fb={d.feedback} tutor={d.feedback.tutor_name ?? 'Your tutor'} />}

      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: '1px solid var(--color-divider)' }}>
        <div className="num" style={{ fontSize: 72, padding: '14px 0 0 14px' }}>{d.feedback ? 2 : 1}</div>
        <div style={{ padding: '18px 16px 18px 4px' }}>
          {!d.task ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }} className="muted">Your task</div>
              <h3 style={{ fontSize: 24, margin: '4px 0 6px' }}>No task yet — check back on Monday</h3>
            </>
          ) : (
            <TaskBlock d={d} locked={locked} onStart={() => navigate(`/learn/task/${d.task!.id}`)} />
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ padding: 16, borderRight: '1px solid var(--color-divider)' }}>
          <div style={{ fontSize: 13 }} className="muted">Live class</div>
          <div style={{ fontWeight: 600, fontSize: 22, marginTop: 2 }}>{d.next_live ? `${weekday(d.next_live)} · ${time(d.next_live)}` : '—'}</div>
          <button type="button" className="btn btn-secondary" style={{ minHeight: 48, marginTop: 10, width: '100%', justifyContent: 'flex-start' }}
            onClick={() => (zoom ? window.open(zoom, '_blank', 'noopener') : toast('Your Zoom link arrives with the welcome guide.'))}>Join Zoom</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13 }} className="muted">Watch again</div>
          <div style={{ fontWeight: 600, fontSize: 22, marginTop: 2 }}>{d.recording ? `${weekdayLong(d.recording.starts_at)}’s class` : 'No recording yet'}</div>
          <button type="button" className="btn btn-secondary" style={{ minHeight: 48, marginTop: 10, width: '100%', justifyContent: 'flex-start' }}
            disabled={!d.recording?.url} onClick={() => d.recording?.url && window.open(d.recording.url, '_blank', 'noopener')}>Play</button>
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="small muted">Only you, your parent and {d.class?.tutor_name ?? 'your tutor'} see your videos.</div>
        <button type="button" className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={async () => { await signOut(); navigate('/learn'); }}>Not {name}?</button>
      </div>
    </Phone>
  );
}

function FeedbackBlock({ fb, tutor }: { fb: NonNullable<LearnerWeekData['feedback']>; tutor: string }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const act = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const url = useQuery({ queryKey: ['vn', fb.voice_note_path], enabled: !!fb.voice_note_path, queryFn: () => signedUrl('voice-notes', fb.voice_note_path) });
  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    if (!url.data) { toast('The voice note is still on its way. Read the note below for now.'); return; }
    if (!audio.current) {
      audio.current = new Audio(url.data);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) { audio.current.pause(); setPlaying(false); } else { void audio.current.play(); setPlaying(true); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: '1px solid var(--color-divider)' }}>
      <div className="num" style={{ fontSize: 72, color: 'var(--color-accent)', padding: '14px 0 0 14px' }}>1</div>
      <div style={{ padding: '18px 16px 18px 4px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {fb.seen_at ? 'Your feedback' : 'New feedback'}
        </div>
        <h3 style={{ fontSize: 24, margin: '4px 0 12px' }}>{tutor} {fb.response_type === 'photo' || fb.response_type === 'text' ? 'read' : 'listened to'} your {fb.task_title} {noun(fb.response_type)}</h3>
        {fb.voice_note_seconds != null && (
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause voice note' : 'Play voice note'} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'var(--color-text)', color: '#fff', border: 0,
            borderRadius: 999, padding: '8px 20px 8px 8px', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-accent)', display: 'grid', placeItems: 'center', flex: 'none' }}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: '#fff' }}>Voice note · {duration(fb.voice_note_seconds)}</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 18, marginTop: 6 }} aria-hidden>
                {WAVE.map((h, i) => <div key={i} style={{ width: 3, height: h, borderRadius: 999, background: i < 3 ? 'var(--color-accent-400)' : 'var(--color-neutral-500)' }} />)}
              </div>
            </div>
          </button>
        )}
        {fb.written && <p style={{ fontSize: 16, lineHeight: 1.45, margin: '12px 0' }}>“{fb.written}”</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(fb.scores).map(([k, v]) => (
            <span key={k} style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', borderRadius: 999, padding: '5px 12px', fontSize: 14, fontWeight: 600 }}>
              {SKILL_LABEL[k] ?? k} {'★'.repeat(v)}
            </span>
          ))}
        </div>
        {!fb.seen_at ? (
          <button type="button" className="btn btn-lime btn-block" style={{ minHeight: 56, fontSize: 17 }}
            onClick={() => act(async () => { audio.current?.pause(); setPlaying(false); await rpc('mark_feedback_seen', { p_feedback: fb.id }); await qc.invalidateQueries({ queryKey: ['learner-week'] }); })}>
            I’ve listened
          </button>
        ) : (
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-700)' }}>✓ Listened — well done!</div>
        )}
      </div>
    </div>
  );
}

function TaskBlock({ d, locked, onStart }: { d: LearnerWeekData; locked: boolean; onStart: () => void }) {
  const t = d.task!;
  const left = hoursLeft(t.due_at);
  const closed = left < 0 && !d.submission;
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }} className="muted">{weekdayLong(t.release_at)} task · {t.response_type}</div>
      <h3 style={{ fontSize: 24, margin: '4px 0 6px' }}>{t.title}</h3>
      <div style={{ fontSize: 15, color: 'var(--color-neutral-800)', marginBottom: 12 }}>
        Due {weekday(t.due_at)} {dayMonth(t.due_at)}, {time(t.due_at)}{left >= 0 ? ` · ${left} hour${left === 1 ? '' : 's'} left` : ''}
      </div>
      {d.submission ? (
        <div style={{ minHeight: 56, borderRadius: 999, background: 'var(--color-text)', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 16, fontWeight: 600 }}>
          ✓ Sent! Feedback on {weekdayLong(correctionRelease(t.due_at))}
        </div>
      ) : closed ? (
        <div style={{ minHeight: 56, borderRadius: 999, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-700)' }}>
          This task has closed
        </div>
      ) : locked ? (
        <div style={{ minHeight: 56, borderRadius: 999, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-700)' }}>
          Listen to your feedback first
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={onStart} className="btn btn-lime" style={{ flex: 1, minHeight: 56, fontSize: 17, justifyContent: 'flex-start' }}>Start task</button>
          <button type="button" onClick={onStart} aria-label="Start task" style={{ width: 56, height: 56, borderRadius: '50%', border: 0, background: 'var(--lime)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 20 }}>↗</button>
        </div>
      )}
    </>
  );
}
