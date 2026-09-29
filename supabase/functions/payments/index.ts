// Card payments (Paystack).
//   { action: "initialize", learner_id, plan_id, callback_url } → { reference, authorization_url }
//   { action: "verify", reference }                             → { status }
// With the stub provider, authorization_url is null and "verify" succeeds at once.
import { admin, asCaller, HttpError, json, requireRole, serve } from '../_shared/http.ts';
import { payments } from '../_shared/providers.ts';

serve(async (req, body) => {
  const { user } = await requireRole(req, 'parent');
  const provider = payments();

  if (body.action === 'initialize') {
    const { data, error } = await asCaller(req).rpc('create_payment', {
      p_learner: body.learner_id, p_plan: body.plan_id, p_method: 'card',
    });
    if (error) throw new HttpError(400, error.message);
    const { authorizationUrl } = await provider.initialize({
      reference: data.reference,
      amountMinor: data.amount_minor,
      currency: data.currency,
      email: user.email ?? `${user.phone}@parents.flyingcolours.app`,
      callbackUrl: String(body.callback_url ?? ''),
    });
    return json({ reference: data.reference, authorization_url: authorizationUrl, provider: provider.name });
  }

  if (body.action === 'verify') {
    const reference = String(body.reference ?? '');
    const db = admin();
    const { data: pay } = await db.from('payments').select('id, guardian_id, amount_minor, status')
      .eq('reference', reference).single();
    if (!pay || pay.guardian_id !== user.id) throw new HttpError(404, 'Payment not found');
    const result = await provider.verify(reference);
    if (!result.ok) return json({ status: 'pending' });
    if (result.amountMinor >= 0 && result.amountMinor !== pay.amount_minor) {
      throw new HttpError(409, 'The amount paid does not match. Our team will check it.');
    }
    const { data, error } = await db.rpc('mark_payment_verified', { p_reference: reference, p_provider_ref: result.providerRef });
    if (error) throw new HttpError(400, error.message);
    return json(data);
  }

  throw new HttpError(400, 'Unknown action');
});
