import { useQuery } from '@tanstack/react-query';
import { ParentTabs, Phone } from '../../components/shells';
import { ErrorNote, Kicker, Loading } from '../../components/ui';
import { rpc } from '../../lib/api';
import { dayDate, focusTag, SKILLS } from '../../lib/format';
import { useSelectedChild } from './common';
import { ChildTabs } from './Home';

interface ProgressData {
  attendance_pct: number | null;
  on_time_pct: number | null;
  feedback_count: number;
  trend: Record<string, number>[];
  history: { id: string; task_title: string; release_at: string; written: string; scores: Record<string, number>; tags: string[]; voice_note_seconds: number | null }[];
}

export default function ParentProgress() {
  const { children, child, select } = useSelectedChild();
  const q = useQuery({
    queryKey: ['progress', child?.id],
    enabled: !!child,
    queryFn: () => rpc<ProgressData>('learner_progress', { p_learner: child!.id }),
  });
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'Africa/Lagos' }).format(new Date());

  return (
    <Phone>
      <div className="phone-head">
        <div className="brand">{child ? `${child.first_name}’s progress` : 'Progress'}</div>
        <div style={{ fontSize: 13 }} className="muted">{child?.class_name}</div>
      </div>
      {children.length > 1 && <ChildTabs kids={children} selected={child?.id} onSelect={select} />}
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : q.data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--color-divider)' }}>
            {[[q.data.attendance_pct, '%', 'Attendance this term'], [q.data.on_time_pct, '%', 'Tasks on time'], [q.data.feedback_count, '', 'Feedback notes']].map(([v, unit, label], i) => (
              <div key={i} style={{ padding: 16, borderRight: i < 2 ? '1px solid var(--color-divider)' : undefined }}>
                <div className="num" style={{ fontSize: 30 }}>{v == null ? '—' : `${v}${unit}`}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, borderBottom: '1px solid var(--color-divider)' }}>
            <Kicker style={{ marginBottom: 10 }}>Rubric score · last {Math.max(q.data.trend.length, 1)} weeks (out of 5)</Kicker>
            {q.data.trend.length === 0 && <div className="small muted">Scores appear after the first feedback.</div>}
            {q.data.trend.length > 0 && SKILLS.map(([key, label]) => {
              const vals = q.data.trend.map((s) => s[key] ?? 0);
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 24px', gap: 10, alignItems: 'end', padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46 }} aria-label={`${label}: ${vals.join(', ')}`}>
                    {vals.map((v, i) => (
                      <div key={i} style={{ flex: 1, height: v * 9, background: i === vals.length - 1 ? 'var(--color-accent)' : 'var(--color-text)', borderRadius: 4 }} />
                    ))}
                  </div>
                  <div className="num" style={{ fontSize: 18 }}>{vals[vals.length - 1]}</div>
                </div>
              );
            })}
          </div>
          <Kicker style={{ padding: '16px 16px 4px' }}>Feedback history</Kicker>
          <div style={{ padding: '0 16px' }}>
            {q.data.history.length === 0 && <div className="small muted" style={{ padding: '12px 0' }}>No feedback yet.</div>}
            {q.data.history.map((h) => {
              const tag = focusTag(h.scores, h.tags);
              return (
                <div key={h.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }} className="muted">
                    <span>{dayDate(h.release_at)} · {h.task_title}</span>{tag && <span className="tag tag-accent">{tag}</span>}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    {h.written ? `“${h.written}”` : 'Rubric scores only.'}
                    {h.voice_note_seconds != null && <span className="muted"> · voice note {Math.floor(h.voice_note_seconds / 60)}:{String(h.voice_note_seconds % 60).padStart(2, '0')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 16 }}>
            <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 48 }} onClick={() => window.print()}>
              Download {month} report (PDF)
            </button>
          </div>
        </>
      )}
      <ParentTabs />
    </Phone>
  );
}
