import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AdminShell } from '../../components/shells';
import { ErrorNote, Kicker, Loading, Pills, useAction } from '../../components/ui';
import { must, rpc } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { dayDate } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Audience = Database['public']['Enums']['ann_audience'];
const CHANNELS: [string, string][] = [['whatsapp', 'WhatsApp'], ['app', 'In-app'], ['email', 'Email']];

export default function AdminAnnouncements() {
  const [aud, setAud] = useState<Audience>('class');
  const [classId, setClassId] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [ch, setCh] = useState<string[]>(['whatsapp', 'app']);
  const [sent, setSent] = useState<string | null>(null);
  const act = useAction();
  const qc = useQueryClient();

  const classes = useQuery({ queryKey: ['class-names'], queryFn: async () => must(await supabase.from('classes').select('id, name').order('name')) });
  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data[0].id); }, [classes.data, classId]);
  const reach = useQuery({
    queryKey: ['reach', aud, classId],
    enabled: aud !== 'class' || !!classId,
    queryFn: () => rpc<{ learners: number; families: number }>('announcement_reach', { p_audience: aud, p_class: classId || null } as never),
  });
  const recent = useQuery({
    queryKey: ['announcements'],
    queryFn: () => rpc<{ id: string; sent_at: string; to: string; message: string; read_pct: number | null; reach: number }[]>('recent_announcements'),
  });

  const className = classes.data?.find((c) => c.id === classId)?.name;
  const reachText = !reach.data ? '…' : aud === 'class' ? `${reach.data.families} families in ${className}` : aud === 'all_learners'
    ? `${reach.data.learners} learners · ${reach.data.families} families` : `${reach.data.families} parents`;

  return (
    <AdminShell>
      <div className="page-head" style={{ display: 'block' }}>
        <div className="kicker-accent">Replaces WhatsApp group broadcasts</div>
        <h2>Announcements</h2>
      </div>
      <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,400px),1fr))' }}>
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sent ? (
            <>
              <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 24, padding: 20 }}>
                <div style={{ font: '600 24px/1.1 var(--font-heading)', letterSpacing: '-.03em' }}>Sent to {sent}</div>
                <div style={{ fontSize: 13, color: 'var(--color-neutral-400)', marginTop: 6 }}>Delivery tracked per family. Parents who miss it see it in-app.</div>
              </div>
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => { setSent(null); setMsg(''); }}>Write another</button>
            </>
          ) : (
            <>
              <div className="field"><div className="label">Send to</div>
                <Pills value={aud} onChange={setAud} btnStyle={{ minHeight: 40 }} options={[['class', 'One class'], ['all_learners', 'All learners'], ['all_parents', 'All parents']] as const} /></div>
              {aud === 'class' && (
                <div className="field"><label htmlFor="a-class">Class</label>
                  <select id="a-class" className="input" style={{ minHeight: 44 }} value={classId} onChange={(e) => setClassId(e.target.value)}>
                    {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              )}
              <div className="field"><label htmlFor="a-msg">Message</label>
                <textarea id="a-msg" className="input" style={{ minHeight: 120 }} value={msg} onChange={(e) => setMsg(e.target.value)}
                  placeholder="e.g. No live class on Sunday (public holiday). Saturday’s class runs as normal at 5 pm." /></div>
              <div className="field"><div className="label">Channels</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CHANNELS.map(([id, label]) => (
                    <button key={id} type="button" className="chip" aria-pressed={ch.includes(id)} style={{ minHeight: 40, padding: '0 14px', fontWeight: 600 }}
                      onClick={() => setCh(ch.includes(id) ? ch.filter((x) => x !== id) : [...ch, id])}>{label}</button>
                  ))}
                </div></div>
              <div style={{ fontSize: 13 }} className="muted">Reaches {reachText}. Every family also gets it in the app.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" style={{ minHeight: 48, minWidth: 200, justifyContent: 'flex-start' }} disabled={msg.trim().length < 5 || !ch.length}
                  onClick={() => act(async () => {
                    await rpc('send_announcement', { p_audience: aud, p_class: aud === 'class' ? classId : null, p_message: msg, p_channels: ch } as never);
                    setSent(reachText);
                    await qc.invalidateQueries({ queryKey: ['announcements'] });
                  }, `Announcement sent to ${reachText}.`)}>Send now</button>
              </div>
            </>
          )}
        </div>
        <div style={{ padding: '20px 28px' }}>
          <Kicker style={{ marginBottom: 8 }}>Recent</Kicker>
          {recent.isLoading ? <Loading /> : recent.error ? <ErrorNote error={recent.error} /> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Sent</th><th>To</th><th>Message</th><th>Read</th></tr></thead>
                <tbody>
                  {recent.data!.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dayDate(a.sent_at)}</td>
                      <td style={{ fontSize: 13 }}>{a.to}</td>
                      <td style={{ fontSize: 13 }}>{a.message}</td>
                      <td style={{ fontSize: 13 }}>{a.read_pct != null ? `${a.read_pct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
