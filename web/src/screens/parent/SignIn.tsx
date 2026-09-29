import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Phone } from '../../components/shells';
import { CodeBoxes, useToast } from '../../components/ui';
import { deviceToken, homeFor, useAuth } from '../../lib/auth';
import { fn } from '../../lib/api';
import { supabase } from '../../lib/supabase';

export const COUNTRY_CODES = ['+234', '+44', '+1'] as const;

export function toE164(cc: string, local: string) {
  let digits = local.replace(/\D/g, '');
  if (cc === '+234' && digits.startsWith('0')) digits = digits.slice(1);
  return `${cc}${digits}`;
}

/** Sends a WhatsApp code, then verifies it. Used by sign-in and sign-up. */
export function useWhatsAppOtp() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (phone: string) => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) { setError(error.message); return false; }
    setSent(true);
    return true;
  };
  const verify = async (phone: string, token: string) => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    setBusy(false);
    if (error) { setError(error.message.includes('expired') || error.message.includes('invalid') ? 'That code isn’t right or has expired.' : error.message); return false; }
    return true;
  };
  return { sent, busy, error, send, verify, reset: () => setSent(false) };
}

export default function ParentSignIn() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cc, setCc] = useState<string>('+234');
  const [local, setLocal] = useState('');
  const [code, setCode] = useState('');
  const otp = useWhatsAppOtp();
  const phone = toE164(cc, local);

  if (session && profile && profile.role !== 'parent') return <Navigate to={homeFor(profile.role)} replace />;
  if (session && profile?.role === 'parent') return <Navigate to="/parent" replace />;

  const onVerify = async () => {
    if (await otp.verify(phone, code)) navigate('/parent');
  };

  // Setting up a child's device needs a parent session; do it in one step.
  const onChildPin = async () => {
    if (deviceToken.get()) { navigate('/learn'); return; }
    toast('Sign in once as the parent to set up this device for PIN sign-in.');
  };

  return (
    <Phone tall>
      <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '28px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -60, bottom: -90, width: 200, height: 200, borderRadius: '50%', background: 'var(--lime)' }} />
        <div style={{ font: '600 18px/1 var(--font-heading)', position: 'relative' }}>Flying Colours</div>
        <h1 style={{ font: '600 52px/0.95 var(--font-heading)', letterSpacing: '-.045em', margin: '56px 0 0', position: 'relative' }}>
          Sign <span className="ring" style={{ ['--ring-rot' as string]: '-6deg' }}>in</span>
        </h1>
        <div style={{ fontSize: 15, marginTop: 8, position: 'relative' }}>Parents sign in with their WhatsApp number. No password.</div>
      </div>
      <form style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}
        onSubmit={(e) => { e.preventDefault(); if (otp.sent) void onVerify(); else void otp.send(phone); }}>
        <div className="field">
          <label htmlFor="wa">WhatsApp number</label>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 6 }}>
            <select className="input" style={{ minHeight: 48 }} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Country code">
              {COUNTRY_CODES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input id="wa" className="input" style={{ minHeight: 48, fontSize: 16 }} inputMode="tel" autoComplete="tel-national"
              placeholder="803 412 7765" value={local} onChange={(e) => { setLocal(e.target.value); otp.reset(); setCode(''); }} />
          </div>
        </div>
        {!otp.sent && (
          <button className="btn btn-primary btn-block" style={{ minHeight: 52, fontSize: 16 }} disabled={otp.busy || local.replace(/\D/g, '').length < 7}>
            {otp.busy ? 'Sending…' : 'Send me a code'}
          </button>
        )}
        {otp.sent && (
          <>
            <div className="field">
              <div className="label">6-digit code sent by WhatsApp</div>
              <CodeBoxes value={code} onChange={setCode} autoFocus />
            </div>
            <button className="btn btn-primary btn-block" style={{ minHeight: 52, fontSize: 16 }} disabled={otp.busy || code.length !== 6}>
              {otp.busy ? 'Checking…' : 'Verify and continue'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setCode(''); void otp.send(phone); }}>Resend code</button>
          </>
        )}
        {otp.error && <div className="field-error" role="alert">{otp.error}</div>}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-divider)', paddingTop: 14, display: 'grid', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 48 }} onClick={onChildPin}>A child is signing in with a PIN</button>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>
            New to Flying Colours? <Link to="/signup">Enrol a child</Link> · Staff? <Link to="/staff/signin">Sign in here</Link>
          </div>
        </div>
      </form>
    </Phone>
  );
}

/** Registers this device for learner PIN sign-in (parent must be signed in). */
export async function setUpLearnerDevice() {
  const { device_token } = await fn<{ device_token: string }>('learner-auth', { action: 'device' });
  deviceToken.set(device_token);
}
