import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Kicker, Loading, Pills, useAction } from '../../components/ui';
import { must, rpc } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { dayMonth, LEVEL, time, weekday, weekdayLong } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type RespType = Database['public']['Enums']['resp_type'];
type Attachment = { name: string; path?: string };
const TYPES: [RespType, string][] = [['video', 'Video'], ['audio', 'Audio'], ['photo', 'Photo'], ['text', 'Text']];
const VERB: Record<RespType, string> = { video: 'Record video', audio: 'Record voice', photo: 'Take photo', text: 'Write answer' };

const at = (d: Date, h: number) => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d)}T${String(h).padStart(2, '0')}:00:00+01:00`);

/** The next Monday or Wednesday task slot, with three release options. */
function nextSlots(): Date[] {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getTime() + i * 864e5);
    const wd = weekday(d);
    if ((wd === 'Mon' || wd === 'Wed') && at(d, 9) > now) return [at(d, 9), at(d, 16), at(new Date(d.getTime() + 864e5), 9)];
  }
  return [at(now, 9)];
}

export default function TutorNewTask() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const act = useAction();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const data = useQuery({
    queryKey: ['new-task', classId],
    queryFn: async () => {
      const cls = must(await supabase.from('classes').select('id, name, level').eq('id', classId!).single());
      const templates = must(await supabase.from('task_templates').select('*').eq('level', cls.level).order('sort'));
      return { cls, templates };
    },
  });
  const week = useQuery({ queryKey: ['week-info'], queryFn: () => rpc<{ week: number }>('week_info') });

  const slots = useMemo(nextSlots, []);
  const [tplId, setTplId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [rtype, setRtype] = useState<RespType>('video');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slot, setSlot] = useState(0);
  const [hours, setHours] = useState<24 | 30>(30);
  const [busy, setBusy] = useState(false);

  const pick = (t: Database['public']['Tables']['task_templates']['Row'] | null) => {
    setTplId(t?.id ?? null);
    setTitle(t?.title ?? '');
    setInstructions(t?.instructions ?? '');
    setSteps(t?.steps ?? []);
    setRtype(t?.response_type ?? 'video');
    setAttachments((t?.attachments as Attachment[] | undefined) ?? []);
  };
  useEffect(() => {
    if (data.data && tplId === null && data.data.templates.length) pick(data.data.templates[1] ?? data.data.templates[0]);
  }, [data.data, tplId]);

  if (data.isLoading) return <div className="panel"><Loading /></div>;
  if (data.error) return <div className="panel"><ErrorNote error={data.error} /></div>;
  const { cls, templates } = data.data!;
  const release = slots[slot];
  const due = new Date(release.getTime() + hours * 36e5);
  const fmt = (d: Date) => `${weekday(d)} ${dayMonth(d)} · ${time(d).replace(/^(\d+) /, '$1:00 ')}`;

  const upload = async (f: File | undefined) => {
    if (!f) return;
    await act(async () => {
      const path = `${classId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from('task-attachments').upload(path, f);
      if (error) throw new Error(error.message);
      setAttachments((a) => [...a, { name: f.name, path }]);
    });
  };

  const schedule = async () => {
    setBusy(true);
    await act(async () => {
      await rpc('schedule_task', {
        p_class: cls.id, p_template: tplId, p_title: title, p_instructions: instructions,
        p_steps: steps.filter((s) => s.trim()), p_response_type: rtype, p_attachments: attachments,
        p_release_at: release.toISOString(), p_due_at: due.toISOString(),
      } as never);
      await qc.invalidateQueries({ queryKey: ['queue', classId] });
      navigate(`/tutor/c/${classId}`);
    }, `“${title}” scheduled for ${fmt(release)}. Learners notified on release.`);
    setBusy(false);
  };

  return (
    <div className="panel stack">
      <div className="bar">
        <Link className="btn btn-secondary" to={`/tutor/c/${classId}`}>← {cls.name}</Link>
        <div style={{ fontWeight: 600 }}>New task · {weekdayLong(release)} slot{week.data ? ` · week ${week.data.week}` : ''}</div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))' }}>
        <div style={{ borderRight: '1px solid var(--color-divider)' }}>
          <Kicker style={{ padding: '14px 18px 8px' }}>Curriculum bank · {LEVEL[cls.level]}</Kicker>
          {templates.map((t) => (
            <button key={t.id} type="button" className={`list-btn${t.id === tplId ? ' selected' : ''}`} style={{ padding: '12px 18px' }} onClick={() => pick(t)}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
              <div className="small muted">{TYPES.find(([k]) => k === t.response_type)?.[1]} answer</div>
            </button>
          ))}
          <div style={{ padding: '12px 18px' }}><button type="button" className="btn btn-ghost" onClick={() => pick(null)}>Start from blank</button></div>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid var(--color-divider)', gridColumn: 'span 2', minWidth: 0 }}>
          <div className="field"><label htmlFor="t-title">Title</label>
            <input id="t-title" className="input" style={{ minHeight: 44, fontWeight: 600 }} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label htmlFor="t-ins">Instructions for learners</label>
            <textarea id="t-ins" className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
          <div className="field"><div className="label">Steps learners see (one per line)</div>
            <textarea className="input" style={{ minHeight: 76 }} value={steps.join('\n')} onChange={(e) => setSteps(e.target.value.split('\n'))} aria-label="Steps" /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} className="tag tag-neutral" style={{ gap: 6 }}>
                {a.name}
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                  style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>✕</button>
              </span>
            ))}
            <input ref={fileRef} type="file" hidden onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Add attachment</button>
          </div>
          <div className="field"><div className="label">Learners answer with</div>
            <Pills options={TYPES} value={rtype} onChange={setRtype} btnStyle={{ minHeight: 40, padding: '0 16px' }} /></div>
          <div className="field"><div className="label">Release</div>
            <Pills className="wrap" options={slots.map((s, i) => [i, fmt(s)] as const)} value={slot} onChange={setSlot} btnStyle={{ minHeight: 40 }} /></div>
          <div className="field"><div className="label">Time to submit</div>
            <Pills options={[[24, '24 hours'], [30, '30 hours']] as const} value={hours} onChange={setHours} btnStyle={{ minHeight: 40 }} />
            <div style={{ fontSize: 13, marginTop: 6 }} className="muted">Deadline: <b style={{ color: 'var(--color-text)' }}>{fmt(due)}</b> · reminder to parents 3 hours before</div>
          </div>
          <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 52, fontSize: 15, marginTop: 'auto' }}
            disabled={busy || !title.trim()} onClick={schedule}>{busy ? 'Scheduling…' : 'Schedule task'}</button>
        </div>
        <div style={{ padding: '18px 20px', background: 'var(--color-surface)' }}>
          <Kicker style={{ marginBottom: 10 }}>Learner preview</Kicker>
          <div style={{ background: 'var(--color-bg)', borderRadius: 28, boxShadow: 'var(--shadow-md)', padding: 18, maxWidth: 300 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }} className="muted">Task · {rtype}</div>
            <div style={{ font: '600 22px/1.1 var(--font-heading)', margin: '4px 0 8px', letterSpacing: '-.03em' }}>{title || 'Untitled task'}</div>
            <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>{instructions}</div>
            <div style={{ fontSize: 12, color: 'var(--color-accent-700)', fontWeight: 600, marginBottom: 10 }}>Due {fmt(due)}</div>
            <div style={{ background: 'var(--lime)', borderRadius: 999, fontWeight: 600, padding: '14px 18px', fontSize: 15 }}>{VERB[rtype]}</div>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Opens {fmt(release)}. Learners and parents are notified on release.</div>
        </div>
      </div>
    </div>
  );
}
