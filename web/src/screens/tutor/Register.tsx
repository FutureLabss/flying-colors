import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Kicker, Loading, useAction, useToast } from '../../components/ui';
import { fn, must, rpc } from '../../lib/api';
import { clock, dayDate, dateTime } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Att = 'present' | 'late' | 'absent';
const OPTS: [Att, string][] = [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent']];

export default function TutorRegister() {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const act = useAction();
  const toast = useToast();
  const qc = useQueryClient();

  const sessions = useQuery({
    queryKey: ['sessions', classId],
    queryFn: async () => must(await supabase.from('live_sessions')
      .select('id, starts_at, ends_at, recording_url, recording_minutes, recording_found_at, recording_attached_at, register_saved_at')
      .eq('class_id', classId!).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(12)),
  });
  const cls = useQuery({
    queryKey: ['class-roster', classId],
    queryFn: async () => ({
      cls: must(await supabase.from('classes').select('id, name').eq('id', classId!).single()),
      roster: must(await supabase.from('learners').select('id, first_name, last_name, age')
        .eq('class_id', classId!).eq('status', 'active').order('first_name')),
    }),
  });
  const session = sessions.data?.find((s) => s.id === sessionId);
  const existing = useQuery({
    queryKey: ['attendance', sessionId],
    enabled: !!session,
    queryFn: async () => must(await supabase.from('attendance').select('learner_id, status').eq('session_id', sessionId!)),
  });

  const [marks, setMarks] = useState<Record<string, Att>>({});
  useEffect(() => {
    if (existing.data) setMarks(Object.fromEntries(existing.data.map((a) => [a.learner_id, a.status as Att])));
  }, [existing.data]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 };
    cls.data?.roster.forEach((r) => { c[marks[r.id] ?? 'present'] += 1; });
    return c;
  }, [marks, cls.data]);

  if (sessions.isLoading || cls.isLoading) return <div className="panel"><Loading /></div>;
  if (sessions.error || cls.error) return <div className="panel"><ErrorNote error={sessions.error ?? cls.error} /></div>;
  if (!sessionId || !session) {
    const latest = sessions.data?.[0];
    return latest ? <Navigate to={`/tutor/c/${classId}/register/${latest.id}`} replace />
      : <div className="panel"><div className="empty">No live classes have happened yet. <Link to={`/tutor/c/${classId}`}>Back</Link></div></div>;
  }
  const { cls: c, roster } = cls.data!;

  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions', classId] });

  return (
    <div className="panel stack">
      <div className="bar">
        <Link className="btn btn-secondary" to={`/tutor/c/${classId}`}>← {c.name}</Link>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Register ·
          <select className="input" style={{ width: 'auto', minHeight: 32, fontWeight: 600, padding: '2px 10px' }} value={session.id}
            onChange={(e) => navigate(`/tutor/c/${classId}/register/${e.target.value}`)} aria-label="Session">
            {sessions.data!.map((s) => <option key={s.id} value={s.id}>{dayDate(s.starts_at)}{s.register_saved_at ? '' : ' · not saved'}</option>)}
          </select>
          · {clock(session.starts_at).replace(' pm', '')}–{clock(session.ends_at)} WAT
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 14 }}>
          <span><b>{counts.present}</b> present</span><span><b>{counts.late}</b> late</span>
          <span style={{ color: 'var(--color-accent-700)' }}><b>{counts.absent}</b> absent</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))' }}>
        <div style={{ padding: '18px 24px', borderRight: '1px solid var(--color-divider)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }} className="muted">{session.register_saved_at ? `Saved ${dateTime(session.register_saved_at)}. Changes update each timeline.` : 'Everyone starts as present. Tap the exceptions.'}</div>
            <button type="button" className="btn btn-ghost" onClick={() => setMarks({})}>Reset to all present</button>
          </div>
          {roster.map((r) => {
            const v = marks[r.id] ?? 'present';
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <div><div style={{ fontWeight: 600, fontSize: 15 }}>{r.first_name} {r.last_name}</div><div className="small muted">Age {r.age ?? '—'}</div></div>
                <div className="pills" role="radiogroup" aria-label={`${r.first_name} attendance`}>
                  {OPTS.map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={v === k} onClick={() => setMarks({ ...marks, [r.id]: k })}
                      style={{ minWidth: 84, minHeight: 40, textAlign: 'left', ...(v === k && k === 'absent' ? { background: 'var(--color-accent)' } : {}) }}>{label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Kicker style={{ marginBottom: 8 }}>Recording</Kicker>
            {session.recording_attached_at ? (
              <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 24, padding: 16 }}>
                <div style={{ fontWeight: 600 }}>✓ Recording attached · {session.recording_minutes} min</div>
                <div style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Shown on the class page and in absent-learner follow-ups.</div>
              </div>
            ) : session.recording_url ? (
              <div style={{ border: '2px dashed var(--color-neutral-400)', borderRadius: 24, padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600 }}>Zoom cloud recording found · {session.recording_minutes} min</div>
                <div style={{ fontSize: 13 }} className="muted">{dateTime(session.recording_found_at ?? session.ends_at)} · from the class’s Zoom room. Only this class’s learners and parents can watch it.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={() => act(async () => { await rpc('attach_recording', { p_session: session.id }); await refresh(); }, 'Recording attached.')}>Attach to session</button>
                  <a className="btn btn-secondary" href={session.recording_url} target="_blank" rel="noopener noreferrer">Watch first</a>
                </div>
              </div>
            ) : (
              <div style={{ border: '2px dashed var(--color-neutral-400)', borderRadius: 24, padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600 }}>No recording found yet</div>
                <div style={{ fontSize: 13 }} className="muted">Zoom usually finishes processing within an hour of class.</div>
                <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }}
                  onClick={() => act(async () => {
                    const r = await fn<{ recording_url: string | null }>('recordings', { session_id: session.id });
                    await refresh();
                    if (!r.recording_url) toast('Still processing. Try again later.');
                  })}>Check Zoom again</button>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 14 }}>
            <Kicker style={{ marginBottom: 8 }}>After you save</Kicker>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '8px 10px', fontSize: 14 }}>
              <b style={{ color: 'var(--color-accent)' }}>1</b><span>Parents of the {counts.absent} absent learner{counts.absent === 1 ? '' : 's'} get a WhatsApp message{session.recording_url ? ' with the recording link' : ''}.</span>
              <b style={{ color: 'var(--color-accent)' }}>2</b><span>Learners absent 2 classes running are flagged to the lead tutor.</span>
              <b style={{ color: 'var(--color-accent)' }}>3</b><span>Attendance is added to each learner’s timeline.</span>
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 52, fontSize: 15, marginTop: 'auto' }}
            onClick={() => act(async () => {
              const r = await rpc<{ present: number; late: number; absent: number; flagged: number }>('save_register', {
                p_session: session.id,
                p_entries: roster.map((l) => ({ learner_id: l.id, status: marks[l.id] ?? 'present' })),
              });
              await refresh();
              await qc.invalidateQueries({ queryKey: ['attendance', session.id] });
              await qc.invalidateQueries({ queryKey: ['queue', classId] });
              return r;
            }, (r) => `Register saved: ${r.present} present, ${r.late} late, ${r.absent} absent.${r.absent ? ' Absent parents get the recording link.' : ''}${r.flagged ? ` ${r.flagged} flagged to the lead tutor.` : ''}`)}>
            {session.register_saved_at ? 'Update register' : 'Save register'}
          </button>
        </div>
      </div>
    </div>
  );
}
