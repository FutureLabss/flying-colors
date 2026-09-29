import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminShell } from '../../components/shells';
import { Dialog, ErrorNote, Loading, useAction } from '../../components/ui';
import { fn, must } from '../../lib/api';
import { relativeAgo, ROLE } from '../../lib/format';
import { supabase } from '../../lib/supabase';

const ROLE_TAG: Record<string, string> = { owner: 'tag-ink', lead_tutor: 'tag-accent', customer_service: 'tag-accent', tutor: 'tag-neutral' };
const CAPS: [string, string, string, string, string][] = [
  ['Approve payments', '✓', '—', '✓', '—'],
  ['Place learners · assign tutors', '✓', '✓', '—', '—'],
  ['Registers, tasks, feedback', '✓', 'All classes', '—', 'Own classes'],
  ['Renewals follow-up', '✓', '—', '✓', '—'],
  ['View submissions', '✓', 'All', '—', 'Own classes'],
  ['Reports', '✓', 'Classes only', 'Renewals only', 'Own classes'],
  ['Staff, settings, payment setup', '✓', '—', '—', '—'],
];

export default function AdminStaff() {
  const [invite, setInvite] = useState(false);
  const q = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const staff = must(await supabase.from('profiles').select('id, full_name, display_name, role, two_factor, last_active_at')
        .in('role', ['owner', 'lead_tutor', 'customer_service', 'tutor']).order('role'));
      const classes = must(await supabase.from('classes').select('name, tutor_id'));
      return staff.map((s) => ({ ...s, classes: classes.filter((c) => c.tutor_id === s.id).map((c) => c.name) }));
    },
  });
  const order = ['owner', 'lead_tutor', 'customer_service', 'tutor'];

  return (
    <AdminShell>
      <div className="page-head">
        <div><div className="kicker-accent">Settings</div><h2>Staff &amp; roles</h2></div>
        <button type="button" className="btn btn-primary" onClick={() => setInvite(true)}>Invite staff</button>
      </div>
      <div className="pad">
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Classes</th><th>2-factor</th><th>Last active</th></tr></thead>
              <tbody>
                {[...q.data!].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.role === 'tutor' || s.role === 'lead_tutor' ? `${s.display_name.split(' ')[0]} ${s.full_name}` : s.full_name}</td>
                    <td><span className={`tag ${ROLE_TAG[s.role]}`}>{ROLE[s.role]}</span></td>
                    <td>{s.role === 'owner' ? 'All' : s.role === 'lead_tutor' ? 'All · oversight' : s.classes.join(', ') || '—'}</td>
                    <td style={s.two_factor ? undefined : { color: 'var(--color-accent-700)', fontWeight: 600 }}>{s.two_factor ? 'On' : 'Not set up'}</td>
                    <td>{relativeAgo(s.last_active_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h4 style={{ margin: '28px 0 8px' }}>What each role can do</h4>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Capability</th><th>Owner</th><th>Lead tutor</th><th>Customer service</th><th>Tutor</th></tr></thead>
            <tbody>{CAPS.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
    </AdminShell>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ full_name: '', display_name: '', email: '', role: 'tutor' });
  const act = useAction();
  const qc = useQueryClient();
  return (
    <Dialog title="Invite staff" body="They get an email to set a password. New staff must set up 2-factor sign-in before first use." onClose={onClose}>
      <div className="field"><label htmlFor="i-name">Full name</label><input id="i-name" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div className="field"><label htmlFor="i-display">Shown to families as</label><input id="i-display" className="input" placeholder="e.g. Ms Adaeze" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
      <div className="field"><label htmlFor="i-email">Work email</label><input id="i-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="i-role">Role</label>
        <select id="i-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {['tutor', 'lead_tutor', 'customer_service', 'owner'].map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
        </select></div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => act(async () => {
          await fn('invite-staff', f);
          await qc.invalidateQueries({ queryKey: ['staff'] });
          onClose();
        }, `Invite sent to ${f.email}.`)}>Send invite</button>
      </div>
    </Dialog>
  );
}
