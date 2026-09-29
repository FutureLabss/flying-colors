import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function StaffSignIn() {
  const { session, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session && profile) return <Navigate to={homeFor(profile.role)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  };

  return (
    <div className="panel stack" style={{ maxWidth: 520, minHeight: 'auto', marginTop: '10vh' }}>
      <div className="page-head" style={{ display: 'block' }}>
        <div className="kicker-accent">Staff</div>
        <h2>Sign in to Flying Colours</h2>
      </div>
      <form onSubmit={submit} style={{ padding: '20px 28px 28px', display: 'grid', gap: 14 }}>
        <div className="field"><label htmlFor="email">Work email</label>
          <input id="email" className="input" style={{ minHeight: 44 }} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label>
          <input id="pw" className="input" style={{ minHeight: 44 }} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="field-error" role="alert">{error}</div>}
        <button className="btn btn-primary" style={{ minHeight: 48, justifyContent: 'flex-start' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="small muted">Parents sign in with WhatsApp: <Link to="/signin">parent sign-in</Link>.</div>
      </form>
    </div>
  );
}
