import { useInfiniteQuery } from '@tanstack/react-query';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Loading } from '../../components/ui';
import { must } from '../../lib/api';
import { dayDate, time } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { downloadCsv } from './csv';

const PAGE = 50;

export default function AdminAudit() {
  const q = useInfiniteQuery({
    queryKey: ['audit'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => must(await supabase.from('audit_log').select('id, at, actor_name, actor_role, action, target')
      .order('at', { ascending: false }).range(pageParam, pageParam + PAGE - 1)),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">Placements · payments · permissions</div><h2>Audit log</h2></div>
        <button type="button" className="btn btn-secondary" disabled={!rows.length}
          onClick={() => downloadCsv('audit-log', rows.map((r) => ({ When: r.at, Who: r.actor_name, Role: r.actor_role, Action: r.action, Target: r.target })))}>Export</button>
      </div>
      <div className="pad">
        <div style={{ fontSize: 13, marginBottom: 8 }} className="muted">Every placement, payment decision, renewal outcome, class change and role change, newest first.</div>
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{Date.now() - new Date(a.at).getTime() < 5 * 60000 ? 'Just now' : `${dayDate(a.at)} · ${time(a.at)}`}</td>
                    <td><div style={{ fontWeight: 600 }}>{a.actor_name}</div><div className="small muted">{a.actor_role}</div></td>
                    <td>{a.action}</td>
                    <td style={{ fontSize: 13 }}>{a.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.hasNextPage && <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more</button>}
      </div>
    </AdminShell>
  );
}
