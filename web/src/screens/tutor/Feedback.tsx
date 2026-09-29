import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Kicker, Loading, PlayIcon, useAction, useToast } from '../../components/ui';
import { must, rpc, signedUrl } from '../../lib/api';
import { correctionRelease, dayDate, dayTime, duration, focusTag, SKILLS, weekdayLong } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { rowStatus, STATUS_TAG, useQueue, type QueueRow } from './data';

const TAGS = ['Pronunciation', 'Grammar', 'Fluency', 'Vocabulary', 'Confidence', 'Storytelling'];
const DEFAULT_SCORES = { pronunciation: 3, grammar: 3, fluency: 3, confidence: 3 };

export default function TutorFeedback() {
  const { classId, submissionId } = useParams();
  const q = useQueue(classId);
  const navigate = useNavigate();

  if (q.isLoading) return <div className="panel"><Loading /></div>;
  if (q.error || !q.data?.class) return <div className="panel"><ErrorNote error={q.error ?? new Error('Class not found')} /></div>;
  const d = q.data;
  const subs = d.rows.filter((r) => r.submission_id);
  const current = subs.find((r) => r.submission_id === submissionId);
  if (!current) {
    const first = subs.find((r) => !r.feedback_id) ?? subs[0];
    return first ? <Navigate to={`/tutor/c/${classId}/review/${first.submission_id}`} replace /> : <Navigate to={`/tutor/c/${classId}`} replace />;
  }
  const nRev = subs.filter((r) => r.feedback_id).length;
  const pct = subs.length ? Math.round((nRev / subs.length) * 100) : 0;

  return (
    <div className="panel stack">
      <div className="bar">
        <Link className="btn btn-secondary" to={`/tutor/c/${classId}`}>← Review queue</Link>
        <div style={{ fontWeight: 600 }}>{d.class!.name} · {d.task?.title}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }} className="muted">
          {nRev} of {subs.length} reviewed
          <div style={{ width: 160, height: 8, background: 'var(--color-neutral-300)', borderRadius: 999 }}>
            <div style={{ height: 8, background: 'var(--color-accent)', borderRadius: 999, width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
        <div style={{ borderRight: '1px solid var(--color-divider)' }}>
          {subs.map((r) => {
            const on = r.submission_id === submissionId;
            const st = rowStatus(r);
            return (
              <button key={r.id} type="button" onClick={() => navigate(`/tutor/c/${classId}/review/${r.submission_id}`)} style={{
                width: '100%', border: 0, borderBottom: '1px solid var(--color-divider)', background: on ? 'var(--color-text)' : 'transparent',
                color: on ? '#fff' : 'var(--color-text)', textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.first_name} {r.last_name}</div>
                  <div style={{ fontSize: 12, color: on ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)' }}>{r.submitted_at && dayTime(r.submitted_at)}</div>
                </div>
                <span className={`tag ${STATUS_TAG[st]}`} style={{ fontSize: 10, ...(on && st === 'Reviewed' ? { background: '#fff', color: 'var(--color-text)' } : {}) }}>{st}</span>
              </button>
            );
          })}
        </div>
        <Submission key={current.submission_id} row={current} dueAt={d.task!.due_at} />
        <Form key={`f-${current.submission_id}`} row={current} classId={classId!} dueAt={d.task!.due_at}
          next={subs.find((r) => !r.feedback_id && r.submission_id !== submissionId)} />
      </div>
    </div>
  );
}

function Submission({ row, dueAt }: { row: QueueRow; dueAt: string }) {
  const media = useQuery({
    queryKey: ['submission-media', row.submission_id],
    queryFn: async () => {
      const { data: s, error } = await supabase.from('submissions').select('media_path, text_answer, tasks(response_type)').eq('id', row.submission_id!).single();
      if (error || !s) throw new Error(error?.message ?? 'Submission not found');
      return { ...s, url: await signedUrl('submissions', s.media_path) };
    },
  });
  const history = useQuery({
    queryKey: ['handover', row.id],
    queryFn: async () => {
      const fb = must(await supabase.from('submissions')
        .select('submitted_at, tasks!inner(title, due_at), feedback!inner(written, scores, tags, release_at)')
        .eq('learner_id', row.id).neq('id', row.submission_id!).order('submitted_at', { ascending: false }).limit(2));
      const att = must(await supabase.from('attendance').select('status, live_sessions!inner(starts_at)').eq('learner_id', row.id)
        .order('live_sessions(starts_at)', { ascending: false }).limit(8));
      const late = must(await supabase.from('submissions').select('submitted_at, tasks!inner(due_at)').eq('learner_id', row.id));
      return {
        feedback: fb.map((f) => ({ at: f.submitted_at, ...(f.feedback as unknown as { written: string; scores: Record<string, number>; tags: string[]; release_at: string }) })),
        attended: att.filter((a) => a.status !== 'absent').length, sessions: att.length,
        late: late.filter((s) => new Date(s.submitted_at) > new Date((s.tasks as unknown as { due_at: string }).due_at)).length,
      };
    },
  });
  const lateBy = row.late && row.submitted_at ? Math.round((new Date(row.submitted_at).getTime() - new Date(dueAt).getTime()) / 60000) : 0;
  const rt = (media.data?.tasks as { response_type: string } | null)?.response_type ?? 'video';

  return (
    <div style={{ padding: '20px 24px', minWidth: 0, borderRight: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{row.first_name} {row.last_name}</h3>
        <div style={{ fontSize: 13 }} className="muted">Age {row.age ?? '—'} · submitted {row.submitted_at && dayTime(row.submitted_at)}</div>
      </div>
      {row.late && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>Late · {lateBy >= 60 ? `${Math.floor(lateBy / 60)} h ${lateBy % 60} min` : `${lateBy} min`} after the deadline</div>}
      <div style={{ marginTop: 14, borderRadius: 24, overflow: 'hidden', background: 'var(--color-neutral-900)', color: 'var(--color-neutral-400)', position: 'relative', aspectRatio: rt === 'audio' ? undefined : '16 / 9', maxHeight: 420 }}>
        {media.data?.url && rt === 'video' && <video src={media.data.url} controls playsInline style={{ width: '100%', height: '100%', display: 'block', background: '#000' }} />}
        {media.data?.url && rt === 'audio' && <div style={{ padding: 20 }}><audio src={media.data.url} controls style={{ width: '100%' }} /></div>}
        {media.data?.url && rt === 'photo' && <img src={media.data.url} alt="Submitted page" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {media.data?.text_answer && <div style={{ padding: 20, color: '#fff', fontSize: 16, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{media.data.text_answer}</div>}
        {media.data && !media.data.url && !media.data.text_answer && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14 }}>
            <div style={{ fontSize: 12 }}>Private · signed link expires in 15 min</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-accent)', display: 'grid', placeItems: 'center' }}><PlayIcon size={20} /></div>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--color-neutral-400)' }}>No file attached to this submission (demo data)</div>
              <div style={{ fontSize: 13 }}>{duration(row.duration_seconds)}</div>
            </div>
          </div>
        )}
      </div>
      {media.data?.url && <div className="small muted" style={{ marginTop: 6 }}>Private · signed link expires in 15 min</div>}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--color-divider)', paddingTop: 12 }}>
        <Kicker style={{ marginBottom: 8 }}>{row.first_name}’s timeline · for handover</Kicker>
        {history.data?.feedback.map((f) => (
          <div key={f.at} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <span className="muted">{dayDate(f.release_at)}</span>
            <span>{f.written ? `“${f.written}”` : 'Rubric only'}</span>
            {focusTag(f.scores, f.tags) && <span className="tag tag-accent">{focusTag(f.scores, f.tags)}</span>}
          </div>
        ))}
        {history.data && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <span className="muted">Attendance</span>
            <span>{history.data.attended} of last {history.data.sessions} live classes · {history.data.late} late submission{history.data.late === 1 ? '' : 's'} this term</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Form({ row, classId, dueAt, next }: { row: QueueRow; classId: string; dueAt: string; next?: QueueRow }) {
  const [scores, setScores] = useState<Record<string, number>>(DEFAULT_SCORES);
  const [tags, setTags] = useState<string[]>([]);
  const [written, setWritten] = useState('');
  const [releaseNow, setReleaseNow] = useState(() => correctionRelease(dueAt).getTime() < Date.now());
  const [vn, setVn] = useState<{ state: 'idle' | 'rec' | 'done'; blob?: Blob; seconds?: number; existing?: number }>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  const rec = useRef<{ r: MediaRecorder; t0: number } | null>(null);
  const act = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const release = correctionRelease(dueAt);
  const releasePassed = release.getTime() < Date.now();

  // Opening a reviewed submission loads the saved feedback.
  useEffect(() => {
    if (!row.feedback_id) return;
    supabase.from('feedback').select('scores, tags, written, voice_note_seconds').eq('id', row.feedback_id).single().then(({ data }) => {
      if (!data) return;
      setScores({ ...DEFAULT_SCORES, ...(data.scores as Record<string, number>) });
      setTags(data.tags);
      setWritten(data.written);
      if (data.voice_note_seconds) setVn({ state: 'done', existing: data.voice_note_seconds });
    });
  }, [row.feedback_id]);

  const toggleVoice = async () => {
    if (vn.state === 'rec') { rec.current?.r.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      rec.current = { r, t0: Date.now() };
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setVn({ state: 'done', blob: new Blob(chunks, { type: r.mimeType }), seconds: Math.round((Date.now() - (rec.current?.t0 ?? Date.now())) / 1000) });
      };
      r.start();
      setVn({ state: 'rec' });
      window.setTimeout(() => { if (r.state === 'recording') r.stop(); }, 120_000);
    } catch {
      toast('Allow the microphone in your browser to record a voice note.', 'error');
    }
  };

  const save = async () => {
    setBusy(true);
    const ok = await act(async () => {
      let path: string | null = null;
      if (vn.blob) {
        path = `${row.id}/${row.submission_id}/${crypto.randomUUID()}.webm`;
        const { error } = await supabase.storage.from('voice-notes').upload(path, vn.blob, { contentType: vn.blob.type || 'audio/webm' });
        if (error) throw new Error(error.message);
      }
      await rpc('save_feedback', {
        p_submission: row.submission_id!, p_scores: scores, p_tags: tags, p_written: written,
        p_voice_note_path: path, p_voice_note_seconds: vn.seconds ?? null,
        p_release_now: releaseNow, p_review_seconds: Math.round((Date.now() - started.current) / 1000),
      } as never);
      return true;
    }, `Feedback for ${row.first_name} saved · ${releaseNow ? 'released now, parent notified' : `releases ${weekdayLong(release)} 6 pm`}`);
    setBusy(false);
    if (!ok) return;
    await qc.invalidateQueries({ queryKey: ['queue', classId] });
    await qc.invalidateQueries({ queryKey: ['my-classes'] });
    navigate(next ? `/tutor/c/${classId}/review/${next.submission_id}` : `/tutor/c/${classId}`);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Kicker style={{ marginBottom: 8 }}>Rubric</Kicker>
        {SKILLS.map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
            <div style={{ display: 'flex', gap: 3 }} role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= scores[k];
                return (
                  <button key={n} type="button" role="radio" aria-checked={n === scores[k]} onClick={() => setScores({ ...scores, [k]: n })} style={{
                    width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--color-divider)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: on ? 'var(--color-accent)' : 'transparent', color: on ? '#fff' : 'var(--color-neutral-700)' }}>{n}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div>
        <Kicker style={{ marginBottom: 8 }}>Focus tags</Kicker>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAGS.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tags.includes(t)}
              onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>{t}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="fb-written">Written feedback for {row.first_name} and parent</label>
        <textarea id="fb-written" className="input" style={{ minHeight: 110 }} value={written} onChange={(e) => setWritten(e.target.value)}
          placeholder="What went well, and one thing to try next time…" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn" onClick={toggleVoice} style={{ minHeight: 44, background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--color-accent)' }} />Voice note
        </button>
        <div style={{ fontSize: 13 }} className="muted">
          {vn.state === 'idle' && 'Tap to record — up to 2 min'}
          {vn.state === 'rec' && <span style={{ color: 'var(--color-accent-700)', fontWeight: 600 }}>● Recording… tap to stop</span>}
          {vn.state === 'done' && (
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              ✓ Voice note · {duration(vn.seconds ?? vn.existing ?? 0)} attached{' '}
              <button type="button" className="btn btn-ghost" style={{ padding: '0 4px', fontSize: 13 }} onClick={() => setVn({ state: 'idle' })}>Remove</button>
            </span>
          )}
        </div>
      </div>
      <div>
        <Kicker style={{ marginBottom: 8 }}>Release</Kicker>
        <div className="pills full" style={{ minHeight: 40 }}>
          <button type="button" aria-pressed={!releaseNow} disabled={releasePassed} onClick={() => setReleaseNow(false)} style={{ padding: '0 10px' }}>
            {releasePassed ? `${weekdayLong(release)} 6 pm · passed` : `${weekdayLong(release)} correction · 6 pm`}
          </button>
          <button type="button" aria-pressed={releaseNow} onClick={() => setReleaseNow(true)} style={{ padding: '0 10px' }}>Release now</button>
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 52, fontSize: 15, marginTop: 'auto' }} disabled={busy || vn.state === 'rec'} onClick={save}>
        {busy ? 'Saving…' : next ? 'Save and next learner →' : 'Save and finish'}
      </button>
    </div>
  );
}
