import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/shells';
import { Dialog, ErrorNote, Loading, Pills, useAction } from '../../components/ui';
import { must, rpc } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Database } from '../../lib/database.types';
import { band, dateOnly, dayDate, LEVEL } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Level = Database['public']['Enums']['learner_level'];
interface Cls {
  id: string; name: string; age_min: number; age_max: number; level: Level; capacity: number; tutor_id: string | null;
  zoom_url: string | null; live_schedule: string; task_schedule: string; next_cohort_start: string | null; filled: number;
}

export default function AdminClasses() {
  const { profile } = useAuth();
  const canManage = !!profile && ['owner', 'lead_tutor'].includes(profile.role);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Cls | 'new' | null>(null);
  const act = useAction();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['classes-admin'],
    queryFn: async () => {
      const cls = must(await supabase.from('classes').select('id, name, age_min, age_max, level, capacity, tutor_id, zoom_url, live_schedule, task_schedule, next_cohort_start').order('name'));
      const fill = await rpc<{ class_id: string; filled: number }[]>('class_fill');
      const tutors = must(await supabase.from('profiles').select('id, display_name, full_name, role').in('role', ['tutor', 'lead_tutor']).order('display_name'));
      return { classes: cls.map((c) => ({ ...c, filled: fill.find((f) => f.class_id === c.id)?.filled ?? 0 })) as Cls[], tutors };
    },
  });

  return (
    <AdminShell>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : q.data && (() => {
        const { classes, tutors } = q.data;
        const cc = classes.find((c) => c.id === sel) ?? classes[0];
        const tutorName = (id: string | null) => { const t = tutors.find((x) => x.id === id); return t ? t.display_name || t.full_name : '—'; };
        return (
          <>
            <div className="page-head">
              <div><div className="kicker-accent">{classes.length} classes</div><h2>Classes</h2></div>
              {canManage && <button type="button" className="btn btn-primary" onClick={() => setEdit('new')}>New class</button>}
            </div>
            <div className="split">
              <div className="table-scroll" style={{ padding: '0 28px' }}>
                <table className="table">
                  <thead><tr><th>Class</th><th>Tutor</th><th>Fill</th></tr></thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c.id} className={`clickable${c.id === cc?.id ? ' selected' : ''}`} onClick={() => setSel(c.id)}>
                        <td><div style={{ fontWeight: 600 }}>{c.name}</div><div className="small muted">{band(c)}</div></td>
                        <td>{tutorName(c.tutor_id)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 80, height: 8, background: 'var(--color-neutral-300)', borderRadius: 999 }}>
                              <div style={{ height: 8, background: 'var(--color-text)', borderRadius: 999, width: `${Math.round((c.filled / c.capacity) * 100)}%` }} />
                            </div>
                            <span style={{ fontSize: 13 }}>{c.filled}/{c.capacity}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cc && (
                <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h3 style={{ margin: 0 }}>{cc.name}</h3>
                  <div className="detail-grid" style={{ gridTemplateColumns: '130px 1fr', gap: '8px 16px' }}>
                    <span className="k">Age · level</span><span>{band(cc)}</span>
                    <span className="k">Capacity</span><span>{cc.filled} of {cc.capacity} seats</span>
                    <span className="k">Live classes</span><span>{cc.live_schedule}</span>
                    <span className="k">Zoom link</span><span style={{ fontWeight: 600 }}>{cc.zoom_url ?? '—'} <span style={{ fontWeight: 400 }} className="muted">· stays the same</span></span>
                    <span className="k">Tasks</span><span>{cc.task_schedule}</span>
                    <span className="k">Next cohort</span><span>{cc.next_cohort_start ? dayDate(dateOnly(cc.next_cohort_start)) : '—'}</span>
                  </div>
                  {canManage && (
                    <div className="field">
                      <div className="label">Tutor · tap to reassign</div>
                      <Pills className="wrap" value={cc.tutor_id ?? ''} btnStyle={{ minHeight: 40, padding: '0 12px' }}
                        options={tutors.map((t) => [t.id, t.display_name || t.full_name] as const)}
                        onChange={(id) => act(async () => {
                          await rpc('reassign_tutor', { p_class: cc.id, p_tutor: id });
                          await qc.invalidateQueries({ queryKey: ['classes-admin'] });
                        }, `${tutorName(id)} now teaches ${cc.name} and inherits its full class history.`)} />
                      <div className="small muted" style={{ marginTop: 6 }}>The new tutor inherits every learner’s full history.</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canManage && <Link className="btn btn-secondary" to={`/tutor/c/${cc.id}/learners`}>View roster</Link>}
                    {canManage && <button type="button" className="btn btn-secondary" onClick={() => setEdit(cc)}>Edit class</button>}
                  </div>
                </div>
              )}
            </div>
            {edit && <ClassDialog cls={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
          </>
        );
      })()}
    </AdminShell>
  );
}

function ClassDialog({ cls, onClose }: { cls: Cls | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: cls?.name ?? '', age_min: cls?.age_min ?? 7, age_max: cls?.age_max ?? 9, level: cls?.level ?? ('beginner' as Level),
    capacity: cls?.capacity ?? 20, zoom: cls?.zoom_url ?? '', cohort: cls?.next_cohort_start ?? '',
  });
  const act = useAction();
  const qc = useQueryClient();
  return (
    <Dialog title={cls ? `Edit ${cls.name}` : 'New class'} onClose={onClose}>
      <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
        <div className="field"><label htmlFor="c-min">Age from</label><input id="c-min" className="input" type="number" value={f.age_min} onChange={(e) => setF({ ...f, age_min: +e.target.value })} /></div>
        <div className="field"><label htmlFor="c-max">to</label><input id="c-max" className="input" type="number" value={f.age_max} onChange={(e) => setF({ ...f, age_max: +e.target.value })} /></div>
        <div className="field"><label htmlFor="c-level">Level</label>
          <select id="c-level" className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as Level })}>
            {Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <div className="field"><label htmlFor="c-cap">Seats</label><input id="c-cap" className="input" type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: +e.target.value })} /></div>
        <div className="field"><label htmlFor="c-cohort">Next cohort starts</label><input id="c-cohort" className="input" type="date" value={f.cohort} onChange={(e) => setF({ ...f, cohort: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="c-zoom">Zoom link</label><input id="c-zoom" className="input" value={f.zoom} onChange={(e) => setF({ ...f, zoom: e.target.value })} /></div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => act(async () => {
          await rpc('save_class', { p_id: cls?.id ?? null, p_name: f.name, p_age_min: f.age_min, p_age_max: f.age_max, p_level: f.level,
            p_capacity: f.capacity, p_zoom_url: f.zoom, p_next_cohort: f.cohort || null } as never);
          await qc.invalidateQueries({ queryKey: ['classes-admin'] });
          onClose();
        }, cls ? 'Class saved.' : 'Class created.')}>Save</button>
      </div>
    </Dialog>
  );
}
