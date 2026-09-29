import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/shells';
import { Check, CodeBoxes, useAction, useToast } from '../../components/ui';
import { fn, must, rpc } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Database } from '../../lib/database.types';
import { dateOnly, dayDate, LEVEL, money } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { COUNTRY_CODES, toE164, useWhatsAppOtp } from './SignIn';

type Level = Database['public']['Enums']['learner_level'];
type Plan = Database['public']['Tables']['plans']['Row'];
interface Enrolled { id: string; first_name: string; age: number | null; level: Level }
interface Transfer { payment_id: string; reference: string; amount_minor: number; currency: string }

const STEPS = ['Guardian', 'Child', 'Plan', 'Pay'];
const LEVELS: [Level, string][] = [['starter', 'Starter'], ['beginner', 'Beginner'], ['intermediate', 'Interm.'], ['advanced', 'Adv.']];
const STORE = 'fc-signup';

const load = (): { learner?: Enrolled; plan?: string } => {
  try { return JSON.parse(sessionStorage.getItem(STORE) ?? '{}'); } catch { return {}; }
};
const save = (v: { learner?: Enrolled; plan?: string }) => {
  try { sessionStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode */ }
};

export default function Signup() {
  const [params] = useSearchParams();
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const renewId = params.get('renew');
  const returnRef = params.get('reference') ?? params.get('trxref');
  const signedInParent = !!session && profile?.role === 'parent';

  const [step, setStep] = useState(() => (returnRef ? 5 : renewId ? 4 : params.get('add') ? 2 : 1));
  const [learner, setLearner] = useState<Enrolled | null>(() => load().learner ?? null);
  const [planId, setPlanId] = useState(() => load().plan ?? 'annual');
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [outcome, setOutcome] = useState<'card' | 'transfer' | 'pending'>('card');

  useEffect(() => { save({ learner: learner ?? undefined, plan: planId }); }, [learner, planId]);

  // Later steps need a parent session; without one, start from the top.
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading && !session && step > 1) setStep(1);
  }, [loading, session, step]);

  // Renewal: load the learner being renewed.
  useEffect(() => {
    if (!renewId || !signedInParent) return;
    supabase.from('learners').select('id, first_name, age, level').eq('id', renewId).single()
      .then(({ data }) => { if (data) setLearner(data); });
  }, [renewId, signedInParent]);

  // Back from Paystack's checkout.
  const verified = useRef(false);
  useEffect(() => {
    if (!returnRef || !signedInParent || verified.current) return;
    verified.current = true;
    fn<{ status: string }>('payments', { action: 'verify', reference: returnRef })
      .then((r) => setOutcome(r.status === 'pending' ? 'pending' : 'card'))
      .catch(() => setOutcome('pending'));
  }, [returnRef, signedInParent]);

  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => must(await supabase.from('plans').select('*').order('sort')),
  });
  const plan = plans.data?.find((p) => p.id === planId);

  const finish = async () => {
    await qc.invalidateQueries();
    save({});
  };

  return (
    <Phone tall>
      <div className="phone-head">
        <div className="brand">Flying Colours</div>
        <div className="small muted">Communication &amp; English · Ages 5–13</div>
      </div>
      {step <= 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--color-divider)' }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{
              padding: '10px 8px', fontSize: 12, fontWeight: 600, border: '1px solid var(--color-divider)', borderRadius: 999,
              background: i + 1 < step ? 'var(--color-text)' : i + 1 === step ? 'var(--color-accent)' : 'transparent',
              color: i + 1 <= step ? '#fff' : 'var(--color-neutral-700)',
            }}>{i + 1} · {label}</div>
          ))}
        </div>
      )}

      {step === 1 && <GuardianStep signedIn={signedInParent} onDone={async () => { await refreshProfile(); setStep(2); }} />}
      {step === 2 && (
        <ChildStep
          onBack={() => (signedInParent && params.get('add') ? navigate('/parent') : setStep(1))}
          onDone={(l) => { setLearner(l); setStep(3); }} />
      )}
      {step === 3 && plans.data && (
        <PlanStep plans={plans.data} value={planId} onChange={setPlanId} onBack={() => setStep(renewId ? 4 : 2)} onDone={() => setStep(4)} />
      )}
      {step === 4 && learner && plan && (
        <PayStep learner={learner} plan={plan} method={method} setMethod={setMethod}
          onBack={() => setStep(3)}
          onDone={async (m) => { setOutcome(m); await finish(); setStep(5); }} />
      )}
      {step === 4 && !learner && <div className="empty">Choose a child first.</div>}
      {step === 5 && (
        <DoneStep learner={learner} outcome={outcome} amount={plan ? money(plan.due_today_minor, plan.currency) : ''}
          renewal={!!renewId}
          onHome={async () => { await finish(); navigate('/parent'); }}
          onRestart={() => { save({}); setLearner(null); navigate('/signup?add=1', { replace: true }); setStep(2); }} />
      )}
    </Phone>
  );
}

// ─── 1 · guardian ─────────────────────────────────────────────────────────
function GuardianStep({ signedIn, onDone }: { signedIn: boolean; onDone: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [cc, setCc] = useState('+234');
  const [local, setLocal] = useState('');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [country, setCountry] = useState('Nigeria');
  const [consentData, setConsentData] = useState(true);
  const [consentRec, setConsentRec] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const otp = useWhatsAppOtp();
  const phone = toE164(cc, local);

  const saveProfile = async () => {
    setError(null);
    try {
      await rpc('complete_guardian_profile', {
        p_full_name: name, p_email: email, p_country: country, p_consent_data: consentData, p_consent_recordings: consentRec,
      });
      onDone();
    } catch (e) { setError((e as Error).message); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your full name.'); return; }
    if (!consentData) { setError('We need your consent to process your child’s details.'); return; }
    if (signedIn) { await saveProfile(); return; }
    if (!otp.sent) { await otp.send(phone); return; }
    if (await otp.verify(phone, code)) await saveProfile();
  };

  return (
    <form onSubmit={submit} style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><h2 style={{ fontSize: 28, margin: '0 0 6px' }}>About you</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-800)' }}>You hold the account. Class reminders and feedback alerts come to this number.</p></div>
      <div className="field"><label htmlFor="g-name">Full name</label>
        <input id="g-name" className="input" style={{ minHeight: 44 }} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {!signedIn && (
        <div className="field"><label htmlFor="g-wa">WhatsApp number</label>
          <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 6 }}>
            <select className="input" style={{ minHeight: 44 }} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Country code">
              {COUNTRY_CODES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input id="g-wa" className="input" style={{ minHeight: 44 }} inputMode="tel" autoComplete="tel-national" placeholder="803 412 7765"
              value={local} onChange={(e) => { setLocal(e.target.value); otp.reset(); }} />
          </div></div>
      )}
      <div className="field"><label htmlFor="g-email">Email</label>
        <input id="g-email" className="input" style={{ minHeight: 44 }} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="g-country">Country</label>
        <select id="g-country" className="input" style={{ minHeight: 44 }} value={country} onChange={(e) => setCountry(e.target.value)}>
          {['Nigeria', 'United Kingdom', 'United States', 'Canada', 'Ghana', 'Other'].map((c) => <option key={c}>{c}</option>)}
        </select></div>
      <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
          <input type="checkbox" checked={consentData} onChange={(e) => setConsentData(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 18, height: 18, flex: 'none' }} />
          I agree to Flying Colours processing my child’s details, as set out in the privacy notice (NDPA 2023).
        </label>
        <label style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
          <input type="checkbox" checked={consentRec} onChange={(e) => setConsentRec(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: 18, height: 18, flex: 'none' }} />
          I consent to class recordings and to my child’s submitted videos being kept for up to 12 months after they leave.
        </label>
      </div>
      {otp.sent && !signedIn && (
        <div className="field"><div className="label">We sent a 6-digit code to your WhatsApp</div><CodeBoxes value={code} onChange={setCode} autoFocus /></div>
      )}
      {(error || otp.error) && <div className="field-error" role="alert">{error ?? otp.error}</div>}
      <button className="btn btn-primary btn-block" style={{ minHeight: 48, fontSize: 15 }} disabled={otp.busy || (otp.sent && code.length !== 6)}>
        {otp.busy ? 'Please wait…' : signedIn || !otp.sent ? 'Continue' : 'Verify and continue'}
      </button>
    </form>
  );
}

// ─── 2 · child ────────────────────────────────────────────────────────────
function ChildStep({ onBack, onDone }: { onBack: () => void; onDone: (l: Enrolled) => void }) {
  const blank = { first: '', age: 8, level: 'beginner' as Level, goals: '', prior: false, pin: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const act = useAction();
  const toast = useToast();
  const who = f.first.trim() || 'your child';

  const enrol = async (): Promise<Enrolled | undefined> => {
    if (!f.first.trim()) { toast('Enter your child’s first name.', 'error'); return; }
    setBusy(true);
    const r = await act(async () => {
      const id = await rpc<string>('enrol_child', { p_first_name: f.first, p_age: f.age, p_level: f.level, p_goals: f.goals, p_prior_cohort: f.prior });
      if (f.pin.length === 4) await fn('learner-auth', { action: 'set-pin', learner_id: id, pin: f.pin });
      return { id, first_name: f.first.trim(), age: f.age, level: f.level };
    });
    setBusy(false);
    return r;
  };

  return (
    <form onSubmit={async (e) => { e.preventDefault(); const l = await enrol(); if (l) onDone(l); }}
      style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><h2 style={{ fontSize: 28, margin: '0 0 6px' }}>Your child</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-800)' }}>We only need a first name. Children don’t need an email or phone number.</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <div className="field"><label htmlFor="c-first">First name</label>
          <input id="c-first" className="input" style={{ minHeight: 44 }} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></div>
        <div className="field"><label htmlFor="c-age">Age</label>
          <select id="c-age" className="input" style={{ minHeight: 44 }} value={f.age} onChange={(e) => setF({ ...f, age: +e.target.value })}>
            {[5, 6, 7, 8, 9, 10, 11, 12, 13].map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
      </div>
      <div className="field"><div className="label">Reading and speaking level</div>
        <div className="seg" style={{ display: 'flex' }}>
          {LEVELS.map(([v, label]) => (
            <label key={v} className="seg-opt" style={{ flex: 1 }}>
              <input type="radio" name="lvl" checked={f.level === v} onChange={() => setF({ ...f, level: v })} />{label}
            </label>
          ))}
        </div></div>
      <div className="field"><label htmlFor="c-goals">What would you like {who} to get better at?</label>
        <textarea id="c-goals" className="input" value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })}
          placeholder="e.g. Speaks well at home but goes quiet in class." /></div>
      <div className="field"><label htmlFor="c-prior">Has {who} taken a class with us before?</label>
        <select id="c-prior" className="input" style={{ minHeight: 44 }} value={f.prior ? 'y' : 'n'} onChange={(e) => setF({ ...f, prior: e.target.value === 'y' })}>
          <option value="n">No, this is the first time</option><option value="y">Yes, a past cohort</option>
        </select></div>
      <div className="field"><div className="label">A 4-digit PIN for {who} to sign in on your phone (optional)</div>
        <CodeBoxes value={f.pin} onChange={(pin) => setF({ ...f, pin })} length={4} /></div>
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 44 }} disabled={busy}
        onClick={async () => { const l = await enrol(); if (l) { toast(`${l.first_name} is added. Pay for each child from your dashboard.`); setF(blank); } }}>
        Add another child
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 48 }} onClick={onBack}>Back</button>
        <button className="btn btn-primary" style={{ minHeight: 48, justifyContent: 'flex-start', fontSize: 15 }} disabled={busy}>Continue</button>
      </div>
    </form>
  );
}

// ─── 3 · plan ─────────────────────────────────────────────────────────────
function PlanStep({ plans, value, onChange, onBack, onDone }: { plans: Plan[]; value: string; onChange: (v: string) => void; onBack: () => void; onDone: () => void }) {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><h2 style={{ fontSize: 28, margin: '0 0 6px' }}>Choose a plan</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-800)' }}>Every plan includes two live Zoom classes (Sat and Sun, 5–6 pm WAT), two tasks and private feedback each week.</p></div>
      <div role="radiogroup" aria-label="Plan" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plans.map((p) => {
          const on = p.id === value;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.id)} style={{
              textAlign: 'left', cursor: 'pointer', background: on ? 'var(--color-accent-100)' : 'transparent',
              border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`, borderRadius: 24, padding: 14,
              display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: '4px 12px', alignItems: 'start',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                background: on ? 'var(--color-accent)' : 'transparent', marginTop: 2, boxShadow: 'inset 0 0 0 3px var(--color-bg)' }} />
              <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{p.price_label}</div>
              <div /><div style={{ fontSize: 13, color: 'var(--color-neutral-800)', gridColumn: '2 / -1' }}>{p.description}</div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 13, borderTop: '1px solid var(--color-divider)', paddingTop: 10 }} className="muted">
        Plans run for 12 months. We’ll remind you 7 days, 3 days and on the day before it ends.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 48 }} onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48, justifyContent: 'flex-start', fontSize: 15 }} onClick={onDone}>Continue to payment</button>
      </div>
    </div>
  );
}

// ─── 4 · pay ──────────────────────────────────────────────────────────────
function PayStep({ learner, plan, method, setMethod, onBack, onDone }: {
  learner: Enrolled; plan: Plan; method: 'card' | 'transfer'; setMethod: (m: 'card' | 'transfer') => void;
  onBack: () => void; onDone: (m: 'card' | 'transfer') => void;
}) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const act = useAction();
  const cardOnly = plan.currency !== 'NGN';
  const m = cardOnly ? 'card' : method;

  // Bank details need a reference, so create the transfer when it's chosen.
  useEffect(() => {
    if (m !== 'transfer' || transfer) return;
    act(() => rpc<Transfer>('create_payment', { p_learner: learner.id, p_plan: plan.id, p_method: 'transfer' }))
      .then((t) => t && setTransfer(t));
  }, [m, transfer, learner.id, plan.id, act]);
  useEffect(() => { setTransfer(null); }, [plan.id]);

  const payCard = async () => {
    setBusy(true);
    const ok = await act(async () => {
      const init = await fn<{ reference: string; authorization_url: string | null }>('payments', {
        action: 'initialize', learner_id: learner.id, plan_id: plan.id,
        callback_url: `${window.location.origin}/signup`,
      });
      if (init.authorization_url) { window.location.assign(init.authorization_url); return false; }
      const r = await fn<{ status: string }>('payments', { action: 'verify', reference: init.reference });
      return r.status !== 'pending';
    });
    setBusy(false);
    if (ok) onDone('card');
  };

  const sendTransfer = async () => {
    if (!transfer) return;
    setBusy(true);
    const ok = await act(async () => {
      let path: string | null = null;
      if (receipt) {
        path = `${profile!.id}/${transfer.reference}-${receipt.name.replace(/[^\w.-]/g, '_')}`;
        const { error } = await supabase.storage.from('receipts').upload(path, receipt, { upsert: true });
        if (error) throw new Error(error.message);
      }
      await rpc('submit_transfer', { p_payment: transfer.payment_id, p_receipt_path: path ?? '' });
      return true;
    });
    setBusy(false);
    if (ok) onDone('transfer');
  };

  const due = money(plan.due_today_minor, plan.currency);
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 28, margin: 0 }}>Pay</h2>
      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {[['Learner', `${learner.first_name}${learner.age ? `, ${learner.age}` : ''} · ${LEVEL[learner.level]}`], ['Plan', plan.name]].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
            <span className="muted">{k}</span><span>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 16, fontWeight: 600 }}>
          <span>Due today</span><span>{due}</span></div>
      </div>
      <div className="pills full" style={{ minHeight: 44 }}>
        <button type="button" aria-pressed={m === 'card'} onClick={() => setMethod('card')} style={{ fontSize: 14, padding: '0 12px' }}>Card · Paystack</button>
        <button type="button" aria-pressed={m === 'transfer'} disabled={cardOnly} onClick={() => setMethod('transfer')} style={{ fontSize: 14, padding: '0 12px' }}>Bank transfer</button>
      </div>
      {m === 'card' && (
        <div style={{ fontSize: 14, color: 'var(--color-neutral-800)', background: 'var(--color-surface)', borderRadius: 18, padding: 14 }}>
          Pay by card, bank app or USSD in Paystack’s secure checkout. Your payment is confirmed straight away — no receipt to send.
        </div>
      )}
      {m === 'transfer' && (
        <>
          <div style={{ background: 'var(--color-surface)', borderRadius: 18, padding: 14, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
            <span className="muted">Bank</span><span>GTBank</span>
            <span className="muted">Account</span><span style={{ fontWeight: 600 }}>0123 456 789</span>
            <span className="muted">Name</span><span>Flying Colours Kiddies Ltd</span>
            <span className="muted">Reference</span><span style={{ fontWeight: 600, color: 'var(--color-accent-700)' }}>{transfer?.reference ?? '…'}</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            border: '2px dashed var(--color-neutral-400)', borderRadius: 24, background: 'transparent', minHeight: 72, cursor: 'pointer',
            textAlign: 'left', padding: '12px 14px', fontSize: 14 }}>
            <div style={{ fontWeight: 600 }}>{receipt ? `✓ ${receipt.name}` : 'Upload your receipt'}</div>
            <div className="small muted">{receipt ? 'Tap to choose a different file.' : 'Screenshot or PDF. We confirm within 24 hours.'}</div>
          </button>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 48 }} onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48, justifyContent: 'flex-start', fontSize: 15 }}
          disabled={busy || (m === 'transfer' && !transfer)} onClick={m === 'card' ? payCard : sendTransfer}>
          {busy ? 'Confirming payment…' : m === 'card' ? `Pay ${due} with Paystack` : 'I’ve sent the transfer'}
        </button>
      </div>
    </div>
  );
}

// ─── 5 · done ─────────────────────────────────────────────────────────────
function DoneStep({ learner, outcome, amount, renewal, onHome, onRestart }: {
  learner: Enrolled | null; outcome: 'card' | 'transfer' | 'pending'; amount: string; renewal: boolean;
  onHome: () => void; onRestart: () => void;
}) {
  const name = learner?.first_name ?? 'your child';
  const cohort = useQuery({
    queryKey: ['next-cohort'],
    queryFn: async () => {
      const { data } = await supabase.from('classes').select('next_cohort_start').gte('next_cohort_start', new Date().toISOString().slice(0, 10))
        .order('next_cohort_start').limit(1);
      return data?.[0]?.next_cohort_start ?? null;
    },
  });
  const head = outcome === 'card' ? 'Payment confirmed' : outcome === 'transfer' ? 'Transfer received for checking' : 'Payment processing';
  const sub = outcome === 'card' ? `${amount} received for ${name}. Receipt sent to your email.`
    : outcome === 'transfer' ? 'We’ll match it to your bank alert within 24 hours and message you on WhatsApp.'
    : 'Paystack hasn’t confirmed yet. We’ll message you on WhatsApp as soon as it does.';
  const steps: [string, string][] = renewal ? [
    [`${name} keeps their place`, 'Same class, same tutor, same Zoom link.'],
    ['Your plan now runs for 12 more months', 'We’ll remind you before it ends next year.'],
  ] : [
    [`We place ${name} in a class`, `Matched to ${learner?.age ? `age ${learner.age} · ` : ''}${learner ? LEVEL[learner.level] : 'their level'}, usually within 48 hours.`],
    ['You get a welcome guide on WhatsApp', 'Class page, Zoom link, timetable and how to submit tasks.'],
    [cohort.data ? `First class: ${dayDate(dateOnly(cohort.data))}, 5 pm WAT` : 'First class: the next cohort start', 'New learners join on the next cohort start date.'],
  ];
  return (
    <>
      <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '28px 16px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--lime)', display: 'grid', placeItems: 'center', marginBottom: 16 }}><Check /></div>
        <h1 style={{ fontSize: 34, margin: '0 0 8px', color: '#fff' }}>{head}</h1>
        <p style={{ margin: 0, fontSize: 15 }}>{sub}</p>
      </div>
      <div style={{ padding: '8px 16px 20px' }}>
        {steps.map(([t, s], i) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: '4px 12px', padding: '14px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div className="num" style={{ fontSize: 22 }}>{i + 1}</div>
            <div><div style={{ fontWeight: 600 }}>{t}</div><div style={{ fontSize: 13 }} className="muted">{s}</div></div>
          </div>
        ))}
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 48, marginTop: 16 }} onClick={onHome}>Go to my dashboard</button>
        {!renewal && <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onRestart}>Enrol another child</button>}
      </div>
    </>
  );
}
