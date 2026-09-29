// Development only: one-click sign-in as the seeded demo accounts.
import { useNavigate } from 'react-router-dom';
import { useAction } from '../components/ui';
import { fn } from '../lib/api';
import { deviceToken } from '../lib/auth';
import { supabase } from '../lib/supabase';

const STAFF = [
  ['hassan@flyingcolours.test', 'Hassan', 'Owner', '/admin'],
  ['ronke@flyingcolours.test', 'Mrs Ronke', 'Lead tutor', '/admin'],
  ['blessing@flyingcolours.test', 'Blessing A.', 'Customer service', '/admin'],
  ['adaeze@flyingcolours.test', 'Ms Adaeze', 'Tutor', '/tutor'],
] as const;

const PARENT_PHONE = '+2348034127765';
const PARENT_CODE = '482913';

export default function DevAccounts() {
  const act = useAction();
  const navigate = useNavigate();

  const asParent = async () => {
    const { error } = await supabase.auth.verifyOtp({ phone: PARENT_PHONE, token: PARENT_CODE, type: 'sms' });
    if (error) throw error;
  };
  const asLearner = async (name: string, pin: string) => {
    await asParent();
    const { device_token } = await fn<{ device_token: string }>('learner-auth', { action: 'device' });
    deviceToken.set(device_token);
    const { learners } = await fn<{ learners: { id: string; first_name: string }[] }>('learner-auth', { action: 'household', device_token });
    const l = learners.find((x) => x.first_name === name)!;
    const { session } = await fn<{ session: { access_token: string; refresh_token: string } }>('learner-auth', {
      action: 'sign-in', device_token, learner_id: l.id, pin,
    });
    await supabase.auth.setSession(session);
  };

  return (
    <div className="panel stack" style={{ maxWidth: 640, minHeight: 'auto' }}>
      <div className="page-head" style={{ display: 'block' }}>
        <div className="kicker-accent">Development</div>
        <h2>Demo accounts</h2>
        <div className="small muted">From supabase/seed.sql. Staff password: flyingcolours.</div>
      </div>
      <div className="pad" style={{ display: 'grid', gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}
          onClick={() => act(async () => { await asParent(); navigate('/parent'); })}>
          Mrs F. Adeyemi <span className="muted">Parent · WhatsApp {PARENT_PHONE} · code {PARENT_CODE}</span>
        </button>
        {[['Tolu', '1234'], ['Dami', '5678']].map(([n, pin]) => (
          <button key={n} type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}
            onClick={() => act(async () => { await asLearner(n, pin); navigate('/learn/week'); })}>
            {n} <span className="muted">Learner · PIN {pin}</span>
          </button>
        ))}
        {STAFF.map(([email, name, role, to]) => (
          <button key={email} type="button" className="btn btn-secondary" style={{ justifyContent: 'space-between' }}
            onClick={() => act(async () => {
              await supabase.auth.signOut();
              const { error } = await supabase.auth.signInWithPassword({ email, password: 'flyingcolours' });
              if (error) throw error;
              navigate(to);
            })}>
            {name} <span className="muted">{role} · {email}</span>
          </button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}
