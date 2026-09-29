import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Kicker, Loading, useAction } from '../../components/ui';
import { must, rpc } from '../../lib/api';
import { band, dateOnly, dayDate, daysBetween, LEVEL } from '../../lib/format';
import { supabase } from '../../lib/supabase';

interface Waiting {
  id: string; first_name: string; last_name: string; age: number | null; level: string; goals: string; created_at: string; status: string;
  class_id: string | null; guardian: string; paid: string; paidAt: string | null;
}
interface Cls { id: string; name: string; age_min: number; age_max: number; level: string; capacity: number; filled: number; tutor: string | null; next_cohort_start: string | null }

const PROVIDER: Record<string, string> = { paystack: 'Paystack', bank: 'Transfer', import: 'Imported' };

function suggest(l: Waiting, classes: Cls[]) {
  const score = (c: Cls) => (c.level === l.level ? 2 : 0) + (l.age != null && l.age >= c.age_min && l.age <= c.age_max ? 1 : 0);
  return classes.filter((c) => score(c) >= 2 || (score(c) === 1 && c.level === l.level))
    .concat(classes.filter((c) => score(c) === 1 && c.level !== l.level))
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)
    .sort((a, b) => score(b) - score(a) || Number(a.filled >= a.capacity) - Number(b.filled >= b.capacity))
    .slice(0, 3);
}

export default function AdminPlacement() {
  const qc = useQueryClient();
  const act = useAction();
  const [sel, setSel] = useState<string | null>(null);
  const [placedHere, setPlacedHere] = useState<string[]>([]);

  const q = useQuery({
    queryKey: ['placement', placedHere],
    queryFn: async () => {
      let query = supabase.from('learners')
        .select('id, first_name, last_name, age, level, goals, created_at, status, class_id, guardian:profiles!learners_guardian_id_fkey(display_name, full_name), payments(provider, currency, status, decided_at, sent_at)');
      query = placedHere.length ? query.or(`status.eq.awaiting_placement,id.in.(${placedHere.join(',')})`) : query.eq('status', 'awaiting_placement');
      const rows = must(await query.order('created_at'));
      const waiting: Waiting[] = rows.map((r) => {
        const pays = (r.payments as unknown as { provider: string; currency: string; status: string; decided_at: string | null; sent_at: string | null }[])
          .filter((p) => p.status === 'approved' || p.status === 'auto_verified')
          .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));
        const p = pays[0];
        const g = r.guardian as unknown as { display_name: string; full_name: string } | null;
        return {
          ...r, guardian: g?.display_name || g?.full_name || '—',
          paid: p ? `${dayDate(p.decided_at ?? p.sent_at!)} · ${p.currency === 'USD' ? 'Card USD' : PROVIDER[p.provider] ?? p.provider}` : 'Paid',
          paidAt: p?.decided_at ?? p?.sent_at ?? null,
        };
      });
      const cls = must(await supabase.from('classes').select('id, name, age_min, age_max, level, capacity, next_cohort_start, tutor:profiles(display_name)').order('name'));
      const fill = await rpc<{ class_id: string; filled: number }[]>('class_fill');
      const classes: Cls[] = cls.map((c) => ({
        ...c, tutor: (c.tutor as unknown as { display_name: string } | null)?.display_name ?? null,
        filled: fill.find((f) => f.class_id === c.id)?.filled ?? 0,
      }));
      return { waiting, classes };
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['placement'] });
    await qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };

  return (
    <AdminShell>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : q.data && (() => {
        const { waiting, classes } = q.data;
        const open = waiting.filter((w) => w.status === 'awaiting_placement');
        const sp = waiting.find((w) => w.id === sel) ?? open[0] ?? waiting[0];
        const nextCohort = classes.map((c) => c.next_cohort_start).filter(Boolean).sort()[0];
        return (
          <>
            <div className="page-head" style={{ display: 'block' }}>
              <div className="kicker-accent">{nextCohort ? `Next cohort · ${dayDate(dateOnly(nextCohort))}` : 'Placement'}</div>
              <h2>Placement queue · {open.length} waiting</h2>
            </div>
            {!sp ? <div className="empty">Nobody is waiting for a class. New paid learners appear here.</div> : (
              <div className="collapse-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
                <div style={{ borderRight: '1px solid var(--color-divider)' }}>
                  {waiting.map((w) => {
                    const placed = w.status === 'active' ? classes.find((c) => c.id === w.class_id)?.name : null;
                    const wait = daysBetween(new Date(), w.paidAt ?? w.created_at);
                    return (
                      <button key={w.id} type="button" className={`list-btn${w.id === sp.id ? ' selected' : ''}`} onClick={() => setSel(w.id)}
                        style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{w.first_name} {w.last_name}</div>
                        <div className="small muted">Waiting {wait <= 0 ? 'since today' : `${wait} day${wait === 1 ? '' : 's'}`}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-neutral-800)' }}>Age {w.age ?? '—'} · {LEVEL[w.level]} · {w.paid}</div>
                        <div>{placed && <span className="tag tag-ink">{placed}</span>}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding: '22px 28px' }}>
                  <h3 style={{ margin: 0 }}>{sp.first_name} {sp.last_name}</h3>
                  <div className="detail-grid" style={{ gridTemplateColumns: '120px 1fr', margin: '12px 0 20px' }}>
                    <span className="k">Age · level</span><span>{sp.age ?? '—'} · {LEVEL[sp.level]}</span>
                    <span className="k">Guardian</span><span>{sp.guardian}</span>
                    <span className="k">Payment</span><span>{sp.paid} · verified</span>
                    <span className="k">Goals</span><span>{sp.goals || '—'}</span>
                  </div>
                  {sp.status === 'active' ? (
                    <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 24, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div className="kicker" style={{ color: 'var(--color-accent-400)' }}>Placed</div>
                        <div style={{ fontWeight: 600, fontSize: 18 }}>{classes.find((c) => c.id === sp.class_id)?.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Tutor and parent notified · welcome guide sent</div>
                      </div>
                      <button type="button" className="btn" style={{ border: '1px solid var(--color-neutral-600)', color: 'var(--color-bg)' }}
                        onClick={() => act(async () => { await rpc('unplace_learner', { p_learner: sp.id }); await refresh(); }, 'Placement undone.')}>Undo</button>
                    </div>
                  ) : (
                    <>
                      <Kicker style={{ marginBottom: 8 }}>Suggested classes</Kicker>
                      {suggest(sp, classes).map((c, i) => {
                        const seats = c.capacity - c.filled;
                        const full = seats <= 0;
                        return (
                          <div key={c.id} style={{ background: 'var(--color-surface)', borderRadius: 28, padding: 20, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap' }}>{c.name}</div>
                                {i === 0 && !full && <span className="tag tag-accent">Best match</span>}
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--color-neutral-800)', margin: '2px 0 10px' }}>
                                {band(c)} · {c.tutor ?? 'No tutor'} · starts {c.next_cohort_start ? dayDate(dateOnly(c.next_cohort_start)) : 'any time'}
                                {c.level === sp.level && sp.age != null && sp.age >= c.age_min && sp.age <= c.age_max ? ` · Matches age ${sp.age} · ${LEVEL[sp.level]}` : ''}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, maxWidth: 240, height: 8, background: 'var(--color-neutral-300)', borderRadius: 999 }}>
                                  <div style={{ height: 8, background: 'var(--color-text)', borderRadius: 999, width: `${Math.min(100, Math.round((c.filled / c.capacity) * 100))}%` }} />
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.filled} / {c.capacity} · {full ? 'Full' : `${seats} seat${seats === 1 ? '' : 's'} left`}</div>
                              </div>
                            </div>
                            {full ? (
                              <button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 150, justifyContent: 'flex-start' }}
                                onClick={() => act(() => rpc('add_to_waitlist', { p_learner: sp.id, p_class: c.id }), `${sp.first_name} added to the ${c.name} waitlist`)}>Add to waitlist</button>
                            ) : (
                              <button type="button" className="btn btn-primary" style={{ minHeight: 44, minWidth: 150, justifyContent: 'flex-start' }}
                                onClick={() => act(async () => {
                                  await rpc('place_learner', { p_learner: sp.id, p_class: c.id });
                                  setPlacedHere((p) => [...p, sp.id]);
                                  setSel(open.find((w) => w.id !== sp.id)?.id ?? sp.id);
                                  await refresh();
                                }, `${sp.first_name} placed in ${c.name}. ${c.tutor ?? 'The tutor'} and ${sp.guardian} notified; welcome guide sent.`)}>Place here</button>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </AdminShell>
  );
}
