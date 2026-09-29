import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Phone } from '../../components/shells';
import { Check, Loading, PlayIcon, useToast } from '../../components/ui';
import { rpc, signedUrl } from '../../lib/api';
import { correctionRelease, duration, hoursLeft, weekdayLong } from '../../lib/format';
import { resumableUpload } from '../../lib/upload';
import { useLearnerWeek } from './Week';

type Stage = 'idle' | 'rec' | 'review' | 'up' | 'done';
const MAX_SECONDS = 120;

const VERB: Record<string, string> = { video: 'answer with a video', audio: 'answer with your voice', photo: 'answer with a photo', text: 'write your answer' };

function pickMime(kind: 'video' | 'audio') {
  const opts = kind === 'video'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return opts.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
}

export default function LearnerTask() {
  const { taskId } = useParams();
  const q = useLearnerWeek();
  const qc = useQueryClient();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [secs, setSecs] = useState(0);
  const [pct, setPct] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [camError, setCamError] = useState<string | null>(null);
  const [camReady, setCamReady] = useState(false);
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const task = q.data?.task && q.data.task.id === taskId ? q.data.task : null;
  const kind = task?.response_type ?? 'video';
  const media = kind === 'video' || kind === 'audio';

  // Live camera / mic preview while idle.
  useEffect(() => {
    if (!task || !media || stage !== 'idle' || q.data?.submission) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia(kind === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (preview.current && kind === 'video') { preview.current.srcObject = s; void preview.current.play().catch(() => {}); }
        setCamError(null);
        setCamReady(true);
      })
      .catch(() => setCamError(kind === 'video' ? 'We can’t use the camera. Allow it in your browser, or choose a video you already recorded.' : 'We can’t use the microphone. Allow it in your browser, or choose a recording.'));
    return () => { cancelled = true; };
  }, [task, media, stage, kind, q.data?.submission]);

  useEffect(() => () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  if (q.isLoading) return <Phone tall><Loading /></Phone>;
  if (!task) return <Navigate to="/learn/week" replace />;
  const locked = !!q.data!.feedback && !q.data!.feedback.seen_at;
  const learnerId = q.data!.learner!.id;
  const tutor = q.data!.class?.tutor_name ?? 'your tutor';
  const left = hoursLeft(task.due_at);
  const alreadySent = !!q.data!.submission && stage !== 'done';

  const setRecorded = (b: Blob, seconds: number) => {
    setBlob(b);
    setBlobUrl(URL.createObjectURL(b));
    setSecs(seconds);
    setStage('review');
  };

  const startRecording = () => {
    if (!stream.current) { fileInput.current?.click(); return; }
    const chunks: Blob[] = [];
    const mime = pickMime(kind as 'video' | 'audio');
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    let elapsed = 0;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setCamReady(false);
      setRecorded(new Blob(chunks, { type: rec.mimeType || mime }), elapsed);
    };
    rec.start(1000);
    setSecs(0);
    setStage('rec');
    timer.current = window.setInterval(() => {
      elapsed += 1;
      setSecs(elapsed);
      if (elapsed >= MAX_SECONDS) rec.stop();
    }, 1000);
  };

  const onPickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) { toast('That file is too big (over 200 MB).', 'error'); return; }
    const url = URL.createObjectURL(f);
    if (kind === 'photo') { setRecorded(f, 0); return; }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => { setRecorded(f, Math.round(Number.isFinite(el.duration) ? el.duration : 0)); URL.revokeObjectURL(url); };
    el.onerror = () => setRecorded(f, 0);
    el.src = url;
  };

  const redo = () => { setBlob(null); setBlobUrl(null); setSecs(0); setStage('idle'); };

  const send = async () => {
    setStage('up');
    setPct(0);
    try {
      let path: string | null = null;
      if (blob) {
        const ext = kind === 'photo' ? (blob.type.split('/')[1] ?? 'jpg') : blob.type.includes('mp4') ? 'mp4' : 'webm';
        path = `${learnerId}/${task.id}/${crypto.randomUUID()}.${ext}`;
        await resumableUpload('submissions', path, blob, setPct);
      }
      setPct(100);
      await rpc('submit_task', { p_task: task.id, p_media_path: path ?? '', p_duration: secs || 0, p_text: kind === 'text' ? text : undefined });
      await qc.invalidateQueries({ queryKey: ['learner-week'] });
      setStage('done');
    } catch (e) {
      toast((e as Error).message, 'error');
      setStage(kind === 'text' ? 'idle' : 'review');
    }
  };

  return (
    <Phone tall>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--color-divider)' }}>
        <Link className="btn btn-secondary" style={{ minHeight: 44 }} to="/learn/week">← This week</Link>
        {left >= 0 && <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>{left} h left</div>}
      </div>

      {stage === 'done' ? (
        <div style={{ flex: 1, background: 'var(--color-accent)', color: '#fff', padding: '32px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--lime)', display: 'grid', placeItems: 'center' }}><Check size={40} /></div>
          <div style={{ font: '600 88px/0.9 var(--font-heading)', letterSpacing: '-.04em', margin: '24px 0 12px' }}>Sent!</div>
          <p style={{ fontSize: 19, lineHeight: 1.4, margin: '0 0 8px' }}>{tutor} will send your feedback on {weekdayLong(correctionRelease(task.due_at))}.</p>
          <p style={{ fontSize: 15, margin: 0 }}>Your parent got a message too. Nobody else in class can see your {kind === 'text' ? 'answer' : kind}.</p>
          <Link className="btn btn-block" style={{ marginTop: 'auto', minHeight: 56, background: '#fff', color: 'var(--color-text)', fontSize: 17 }} to="/learn/week">Back to my week</Link>
        </div>
      ) : locked ? (
        <div style={{ padding: '24px 16px' }}>
          <h2 style={{ fontSize: 28 }}>Listen to your feedback first</h2>
          <p style={{ fontSize: 16 }}>{tutor} left you feedback. Listen to it, then this task opens.</p>
          <Link className="btn btn-primary btn-block" style={{ minHeight: 56, fontSize: 17 }} to="/learn/week">Go to my feedback</Link>
        </div>
      ) : (
        <>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }} className="muted">{weekdayLong(task.release_at)} task · {VERB[kind]}</div>
            <h2 style={{ fontSize: 30, margin: '4px 0 10px' }}>{task.title}</h2>
            {task.steps.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '6px 8px', fontSize: 16, lineHeight: 1.4, marginBottom: 12 }}>
                {task.steps.map((s, i) => <FragmentStep key={i} n={i + 1} text={s} />)}
              </div>
            ) : <p style={{ fontSize: 16, lineHeight: 1.4 }}>{task.instructions}</p>}
            {task.attachments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {task.attachments.map((a) => (
                  <button key={a.name} type="button" className="btn btn-secondary" style={{ minHeight: 44, justifyContent: 'flex-start' }}
                    onClick={async () => {
                      const url = await signedUrl('task-attachments', a.path);
                      if (url) window.open(url, '_blank', 'noopener'); else toast('Ask your tutor for this sheet in class.');
                    }}>{a.name.replace(/\.pdf$/, '').replace('Story sheet', 'Story sheet')}</button>
                ))}
              </div>
            )}
            {alreadySent && <div className="tag tag-grey" style={{ marginBottom: 8 }}>You already sent this. Sending again replaces it.</div>}
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <input ref={fileInput} type="file" hidden
              accept={kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : 'image/*'}
              capture={kind === 'photo' ? 'environment' : kind === 'video' ? 'user' : undefined}
              onChange={(e) => onPickFile(e.target.files?.[0])} />

            {kind === 'text' && stage !== 'up' && (
              <>
                <textarea className="input" style={{ minHeight: 220, fontSize: 17, borderRadius: 28, padding: 16 }} value={text}
                  onChange={(e) => setText(e.target.value)} placeholder="Write your answer here…" aria-label="Your answer" />
                <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 64, fontSize: 17 }} disabled={text.trim().length < 3} onClick={send}>Send to {tutor}</button>
              </>
            )}

            {kind !== 'text' && stage === 'idle' && (
              <>
                {kind === 'photo' ? (
                  <button type="button" onClick={() => fileInput.current?.click()} style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: 28, border: '2px dashed var(--color-neutral-400)', background: 'var(--color-surface)', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}>
                    Take a photo of your page
                  </button>
                ) : (
                  <div style={{ aspectRatio: kind === 'video' ? '4 / 5' : '4 / 3', borderRadius: 28, overflow: 'hidden', background: 'var(--color-neutral-900)', color: 'var(--color-neutral-400)', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14, fontSize: 13 }}>
                    {kind === 'video' && <video ref={preview} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
                    <span style={{ position: 'relative' }}>{camError ?? (kind === 'video' ? 'Camera preview · front camera' : 'Microphone ready')}</span>
                  </div>
                )}
                {kind !== 'photo' && (
                  <button type="button" onClick={startRecording} className="btn btn-primary btn-block" style={{ minHeight: 64, fontSize: 19, gap: 12 }}
                    disabled={!camReady && !camError}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                    {camError ? 'Choose a recording' : camReady ? 'Start recording' : kind === 'video' ? 'Starting camera…' : 'Starting microphone…'}
                  </button>
                )}
                <div style={{ fontSize: 14, marginTop: 8 }} className="muted">
                  {kind === 'photo' ? 'Make sure all five sentences are in the picture.' : 'Up to 2 minutes. You can record again before you send.'}
                </div>
              </>
            )}

            {stage === 'rec' && (
              <>
                <div style={{ aspectRatio: kind === 'video' ? '4 / 5' : '4 / 3', borderRadius: 28, overflow: 'hidden', background: 'var(--color-neutral-900)', border: '6px solid var(--color-accent)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14, position: 'relative' }}>
                  {kind === 'video' && <video ref={(el) => { if (el && stream.current) { el.srcObject = stream.current; void el.play().catch(() => {}); } }} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 18, position: 'relative' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-accent)' }} />REC {duration(secs)}
                    <span style={{ fontWeight: 400, color: 'var(--color-neutral-400)', fontSize: 14 }}>/ 2:00</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-neutral-400)', position: 'relative' }}>{kind === 'video' ? 'Camera preview' : 'Recording your voice…'}</div>
                </div>
                <button type="button" onClick={() => recorder.current?.stop()} className="btn btn-block btn-ink" style={{ minHeight: 64, fontSize: 19, gap: 12 }}>
                  <span style={{ width: 18, height: 18, background: 'var(--color-accent)' }} />Stop
                </button>
              </>
            )}

            {stage === 'review' && blobUrl && (
              <>
                <div style={{ aspectRatio: kind === 'audio' ? '4 / 3' : '4 / 5', borderRadius: 28, overflow: 'hidden', background: 'var(--color-neutral-800)', color: '#fff', display: 'grid', placeItems: 'center', position: 'relative' }}>
                  {kind === 'video' && <video src={blobUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {kind === 'photo' && <img src={blobUrl} alt="Your photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {kind === 'audio' && (
                    <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
                      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-accent)', display: 'grid', placeItems: 'center' }}><PlayIcon size={30} /></div>
                      <audio src={blobUrl} controls />
                    </div>
                  )}
                  {kind !== 'photo' && <div style={{ position: 'absolute', left: 14, bottom: 12, fontSize: 14, fontWeight: 600, pointerEvents: 'none' }}>Your {kind === 'video' ? 'video' : 'recording'} · {duration(secs)}</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={redo} className="btn btn-secondary" style={{ minHeight: 64, fontSize: 16, justifyContent: 'flex-start' }}>{kind === 'photo' ? 'Take again' : 'Record again'}</button>
                  <button type="button" onClick={send} className="btn btn-primary" style={{ minHeight: 64, fontSize: 17, justifyContent: 'flex-start' }}>Send to {tutor}</button>
                </div>
              </>
            )}

            {stage === 'up' && (
              <div style={{ aspectRatio: '4 / 5', borderRadius: 28, overflow: 'hidden', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 16 }}>
                <div className="num" style={{ fontSize: 72, color: 'var(--color-accent)' }}>{pct}%</div>
                <div style={{ fontSize: 18, fontWeight: 600, margin: '6px 0 12px' }}>Sending your {kind === 'text' ? 'answer' : kind}…</div>
                <div style={{ height: 14, background: 'var(--color-neutral-300)', borderRadius: 999 }}>
                  <div style={{ height: 14, background: 'var(--color-accent)', borderRadius: 999, width: `${pct}%`, transition: 'width .2s' }} />
                </div>
                <div style={{ fontSize: 14, color: 'var(--color-neutral-800)', marginTop: 12 }}>Keep this page open. If the internet drops, we carry on from where we stopped.</div>
              </div>
            )}
          </div>
        </>
      )}
    </Phone>
  );
}

function FragmentStep({ n, text }: { n: number; text: string }) {
  return (<><b style={{ color: 'var(--color-accent)' }}>{n}</b><span>{text}</span></>);
}
