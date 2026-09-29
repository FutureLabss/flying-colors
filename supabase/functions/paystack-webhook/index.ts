// Paystack webhook: charge.success confirms a payment even if the parent
// closed the checkout before returning; refunds and reversals are flagged.
import { admin, cors, json } from '../_shared/http.ts';
import { payments } from '../_shared/providers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const raw = await req.text();
  if (!(await payments().verifyWebhook(raw, req.headers.get('x-paystack-signature')))) {
    return json({ error: 'Bad signature' }, 401);
  }
  const event = JSON.parse(raw);
  const db = admin();
  const reference = event.data?.reference;

  if (event.event === 'charge.success') {
    const { data: pay } = await db.from('payments').select('amount_minor').eq('reference', reference).single();
    if (pay && pay.amount_minor === event.data.amount) {
      await db.rpc('mark_payment_verified', { p_reference: reference, p_provider_ref: String(event.data.id) });
    }
  } else if (event.event === 'refund.processed' || event.event === 'charge.dispute.create') {
    await db.from('payments').update({ status: 'reversed', decided_at: new Date().toISOString() }).eq('reference', reference);
    await db.from('audit_log').insert({
      actor_name: 'System', actor_role: 'Paystack', action: 'Reversal flagged', target: `ref ${reference}`,
    });
  }
  return json({ ok: true });
});
