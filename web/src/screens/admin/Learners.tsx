import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Loading, Pills } from '../../components/ui';
import { must } from '../../lib/api';
import { LEVEL } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Filter = 'all' | 'active' | 'waiting' | 'review' | 'exited';
const STATUS: Record<string, string> = { active: 'Active', awaiting_placement: 'To place', awaiting_payment: 'Unpaid', exited: 'Left' };

export default function AdminLearners() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const q = useQuery({
    queryKey: ['learners', search, filter],
    queryFn: async () => {
      let query = supabase.from('learners')
        .select('id, code, first_name, last_name, age, level, status, needs_review, cls:classes!learners_class_id_fkey(name), guardian:profiles!learners_guardian_id_fkey(display_name, full_name, phone)', { count: 'exact' });
      if (filter === 'active') query = query.eq('status', 'active');
      if (filter === 'waiting') query = query.in('status', ['awaiting_placement', 'awaiting_payment']);
      if (filter === 'review') query = query.eq('needs_review', true);
      if (filter === 'exited') query = query.eq('status', 'exited');
      const s = search.trim().replace(/[,()]/g, '');
      if (s) query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,code.ilike.%${s}%`);
      const res = await query.order('first_name').limit(100);
      return { rows: must(res), count: res.count ?? 0 };
    },
  });

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">{q.data ? `${q.data.count} learners` : 'Learners'}</div><h2>Learners</h2></div>
        <input className="input" style={{ width: 280, minHeight: 40 }} placeholder="Search by name or FC code" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search learners" />
      </div>
      <div className="pad">
        <Pills value={filter} onChange={setFilter} style={{ marginBottom: 12 }} options={[
          ['active', 'Active'], ['waiting', 'Waiting'], ['review', 'Needs review'], ['exited', 'Left'], ['all', 'All'],
        ] as const} />
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Learner</th><th>Code</th><th>Age · level</th><th>Class</th><th>Guardian</th><th>Status</th></tr></thead>
              <tbody>
                {q.data!.rows.length === 0 && <tr><td colSpan={6} className="muted">No learners match.</td></tr>}
                {q.data!.rows.map((r) => {
                  const g = r.guardian as unknown as { display_name: string; full_name: string; phone: string | null } | null;
                  return (
                    <tr key={r.id}>
                      <td><Link to={`/admin/learners/${r.id}`} style={{ fontWeight: 600, color: 'inherit' }}>{r.first_name} {r.last_name}</Link></td>
                      <td style={{ fontSize: 13 }} className="muted">{r.code}</td>
                      <td>{r.age ?? '—'} · {LEVEL[r.level]}</td>
                      <td>{(r.cls as unknown as { name: string } | null)?.name ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{g?.display_name || g?.full_name}</td>
                      <td>
                        <span className={`tag ${r.status === 'active' ? 'tag-grey' : r.status === 'exited' ? 'tag-neutral' : 'tag-accent'}`}>{STATUS[r.status]}</span>
                        {r.needs_review && <span className="tag tag-violet" style={{ marginLeft: 4 }}>Review</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
