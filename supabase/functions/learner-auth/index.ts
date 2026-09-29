// Children sign in with a 4-digit PIN on a device a parent has set up.
//   { action: "device" }                        parent JWT → { device_token }
//   { action: "household", device_token }       → { learners: [{ id, first_name, class_name }] }
//   { action: "set-pin", learner_id, pin }      parent JWT → { ok }
//   { action: "sign-in", device_token, learner_id, pin } → { session }
// A device token is an HMAC-signed note of which family set up this device.
import { admin, anon, asCaller, HttpError, json, requireRole, serve } from '../_shared/http.ts';

const DEVICE_DAYS = 180;

async function hmacKey() {
  const secret = Deno.env.get('LEARNER_DEVICE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function signDevice(guardianId: string) {
  const payload = b64(new TextEncoder().encode(JSON.stringify({ g: guardianId, exp: Date.now() + DEVICE_DAYS * 864e5 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64(sig)}`;
}

async function readDevice(token: unknown): Promise<string> {
  const [payload, sig] = String(token ?? '').split('.');
  let data: { g: string; exp: number } | null = null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64(sig), new TextEncoder().encode(payload));
    data = ok ? JSON.parse(new TextDecoder().decode(unb64(payload))) : null;
  } catch {
    data = null;
  }
  if (!data || data.exp < Date.now()) throw new HttpError(401, 'Ask a parent to set up this device again.');
  return data.g;
}

/** Each learner gets a passwordless auth account; it is created on first PIN setup. */
async function ensureLearnerUser(learnerId: string) {
  const db = admin();
  const { data: l } = await db.from('learners').select('id, user_id, first_name, last_name').eq('id', learnerId).single();
  if (!l) throw new HttpError(404, 'Learner not found');
  if (l.user_id) return l.user_id as string;
  const { data, error } = await db.auth.admin.createUser({
    email: `learner.${l.id}@learners.flyingcolours.app`,
    email_confirm: true,
    password: crypto.randomUUID(),
    app_metadata: { role: 'learner' },
    user_metadata: { full_name: `${l.first_name} ${l.last_name}`.trim(), display_name: l.first_name },
  });
  if (error) throw new HttpError(500, error.message);
  await db.from('learners').update({ user_id: data.user.id }).eq('id', l.id);
  return data.user.id;
}

serve(async (req, body) => {
  const db = admin();

  switch (body.action) {
    case 'device': {
      const { user } = await requireRole(req, 'parent');
      return json({ device_token: await signDevice(user.id) });
    }

    case 'household': {
      const guardianId = await readDevice(body.device_token);
      const { data, error } = await db.from('learners')
        .select('id, first_name, age, pin_hash, classes!learners_class_id_fkey(name)')
        .eq('guardian_id', guardianId).neq('status', 'exited').order('age');
      if (error) throw new HttpError(500, error.message);
      return json({
        learners: (data ?? []).map((l) => ({
          id: l.id, first_name: l.first_name, age: l.age,
          class_name: (l.classes as unknown as { name: string } | null)?.name ?? 'Starting soon',
          has_pin: !!l.pin_hash,
        })),
      });
    }

    case 'set-pin': {
      await requireRole(req, 'parent');
      const { error } = await asCaller(req).rpc('set_learner_pin', { p_learner: body.learner_id, p_pin: String(body.pin ?? '') });
      if (error) throw new HttpError(400, error.message);
      await ensureLearnerUser(String(body.learner_id));
      return json({ ok: true });
    }

    case 'sign-in': {
      const guardianId = await readDevice(body.device_token);
      const learnerId = String(body.learner_id ?? '');
      const { data: l } = await db.from('learners').select('id, guardian_id').eq('id', learnerId).single();
      if (!l || l.guardian_id !== guardianId) throw new HttpError(404, 'Learner not found');

      const { data: verdict, error } = await db.rpc('check_learner_pin', { p_learner: learnerId, p_pin: String(body.pin ?? '') });
      if (error) throw new HttpError(500, error.message);
      if (verdict === 'locked') throw new HttpError(429, 'Too many tries. Wait 15 minutes or ask your parent.');
      if (verdict === 'no_pin') throw new HttpError(400, 'Your parent needs to set your PIN first.');
      if (verdict !== 'ok') throw new HttpError(401, 'That PIN isn’t right. Try again.');

      // Mint a session: rotate the account's random password and sign in with it.
      const userId = await ensureLearnerUser(learnerId);
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data: u, error: upErr } = await db.auth.admin.updateUserById(userId, { password });
      if (upErr || !u.user.email) throw new HttpError(500, upErr?.message ?? 'Learner account is missing an email');
      const { data: s, error: signErr } = await anon().auth.signInWithPassword({ email: u.user.email, password });
      if (signErr) throw new HttpError(500, signErr.message);
      return json({ session: { access_token: s.session!.access_token, refresh_token: s.session!.refresh_token } });
    }
  }
  throw new HttpError(400, 'Unknown action');
});
