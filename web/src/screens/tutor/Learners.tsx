import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { TutorShell } from '../../components/shells';
import { ErrorNote, Loading } from '../../components/ui';
import { must } from '../../lib/api';
import { supabase } from '../../lib/supabase';

export default function TutorLearners() {
  const { classId } = useParams();
  const q = useQuery({
    queryKey: ['class-learners', classId],
    queryFn: async () => ({
      cls: must(await supabase.from('classes').select('name').eq('id', classId!).single()),
      rows: must(await supabase.from('learners').select('id, first_name, last_name, age, goals, pin_set, guardian:profiles!learners_guardian_id_fkey(display_name, full_name)')
        .eq('class_id', classId!).eq('status', 'active').order('first_name')),
    }),
  });
  return (
    <TutorShell>
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
        <>
          <div className="page-head"><div><div className="kicker-accent">{q.data!.rows.length} learners</div><h2>{q.data!.cls.name}</h2></div></div>
          <div className="pad table-scroll">
            <table className="table">
              <thead><tr><th>Learner</th><th>Guardian</th><th>Goals</th></tr></thead>
              <tbody>
                {q.data!.rows.map((r) => {
                  const g = r.guardian as unknown as { display_name: string; full_name: string } | null;
                  return (
                    <tr key={r.id}>
                      <td><Link to={r.id} style={{ fontWeight: 600, color: 'inherit' }}>{r.first_name} {r.last_name}</Link><div className="small muted">Age {r.age ?? '—'}</div></td>
                      <td>{g?.display_name || g?.full_name}</td>
                      <td style={{ fontSize: 13 }}>{r.goals || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </TutorShell>
  );
}
