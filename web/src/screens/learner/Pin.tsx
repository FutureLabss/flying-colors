import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Phone } from '../../components/shells';
import { fn } from '../../lib/api';
import { deviceToken, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

interface Kid { id: string; first_name: string; age: number | null; class_name: string; has_pin: boolean }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function LearnerPin() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const token = deviceToken.get();
  const [who, setWho] = useState<Kid | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const household = useQuery({
    queryKey: ['household', token],
    enabled: !!token,
    queryFn: () => fn<{ learners: Kid[] }>('learner-auth', { action: 'household', device_token: token }),
    retry: false,
  });

  useEffect(() => {
    if (pin.length !== 4 || !who || busy) return;
    setBusy(true); setError(null);
    fn<{ session: { access_token: string; refresh_token: string } }>('learner-auth', {
      action: 'sign-in', device_token: token, learner_id: who.id, pin,
    }).then(async ({ session }) => {
      await supabase.auth.setSession(session);
      navigate('/learn/week', { replace: true });
    }).catch((e: Error) => {
      setError(e.message);
      setPin('');
    }).finally(() => setBusy(false));
  }, [pin, who, busy, token, navigate]);

  if (session && profile?.role === 'learner') return <Navigate to="/learn/week" replace />;

  const press = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === '⌫') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p + k).slice(0, 4));
  };

  return (
    <Phone tall style={{ background: 'var(--color-accent-600)', color: '#fff', padding: '24px 16px' }}>
      {!token || household.error ? (
        <>
          <h1 style={{ font: '600 44px/1 var(--font-heading)', letterSpacing: '-.045em', margin: '40px 0 16px', color: '#fff' }}>
            Ask a grown-up to set up this phone
          </h1>
          <p style={{ fontSize: 16 }}>A parent signs in once, then chooses “Hand this phone to my child”. After that you just type your PIN.</p>
          <Link to="/signin" className="btn btn-lime" style={{ minHeight: 56, fontSize: 17, marginTop: 'auto', justifyContent: 'flex-start' }}>Parent sign-in</Link>
        </>
      ) : !who ? (
        <>
          <h1 style={{ font: '600 54px/0.98 var(--font-heading)', letterSpacing: '-.045em', margin: '40px 0 28px', color: '#fff' }}>
            Who’s <span className="ring" style={{ ['--ring-rot' as string]: '-4deg' }}>learning</span> today?
          </h1>
          <div style={{ display: 'grid', gap: 10 }}>
            {household.isLoading && <div>Loading…</div>}
            {household.data?.learners.map((k) => (
              <button key={k.id} type="button" onClick={() => { setWho(k); setPin(''); setError(null); }} style={{
                display: 'grid', gridTemplateColumns: '72px 1fr', gap: 14, alignItems: 'center', background: '#fff',
                color: 'var(--color-text)', border: 0, padding: 12, borderRadius: 999, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--lime)', display: 'grid', placeItems: 'center', font: '600 34px/1 var(--font-heading)' }}>{k.first_name[0]}</div>
                <div>
                  <div style={{ font: '600 28px/1 var(--font-heading)' }}>{k.first_name}</div>
                  <div style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 4 }}>{k.has_pin ? k.class_name : 'Ask your parent to set your PIN'}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 'auto', fontSize: 14 }}>Your parent set up your PIN. Ask them if you forget it.</div>
        </>
      ) : (
        <>
          <button type="button" onClick={() => { setWho(null); setPin(''); }} style={{
            alignSelf: 'flex-start', whiteSpace: 'nowrap', background: 'transparent', border: '1px solid #fff', color: '#fff',
            padding: '10px 14px', fontSize: 14, cursor: 'pointer', minHeight: 44, borderRadius: 999 }}>← Not {who.first_name}?</button>
          <h1 style={{ font: '600 52px/0.95 var(--font-heading)', letterSpacing: '-.03em', margin: '32px 0 20px', color: '#fff' }}>Hi {who.first_name}! Type your PIN</h1>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }} aria-label={`${pin.length} of 4 digits`}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #fff', background: i < pin.length ? '#fff' : 'transparent' }} />
            ))}
          </div>
          <div style={{ minHeight: 24, fontSize: 15, fontWeight: 600, color: 'var(--lime)' }} role="alert">{busy ? 'Checking…' : error}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 'auto' }}>
            {KEYS.map((k, i) => k ? (
              <button key={i} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k} style={{
                height: 72, background: 'rgba(255,255,255,.14)', color: '#fff', border: 0, borderRadius: 999,
                font: '600 30px/1 var(--font-heading)', cursor: 'pointer', textAlign: 'left', padding: '0 26px' }}>{k}</button>
            ) : <div key={i} />)}
          </div>
        </>
      )}
    </Phone>
  );
}
