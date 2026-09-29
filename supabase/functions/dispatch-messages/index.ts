// Delivers queued WhatsApp / email messages whose send time has come.
// Run on a schedule (pg_cron + pg_net, or an external cron) with the service
// role key; staff owners can also trigger it.
import { admin, HttpError, json, requireRole, serve } from '../_shared/http.ts';
import { messagingFor } from '../_shared/providers.ts';

serve(async (req) => {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) await requireRole(req, 'owner');

  const db = admin();
  const { data: batch, error } = await db.from('outbound_messages')
    .select('*').eq('status', 'queued').lte('send_after', new Date().toISOString())
    .order('send_after').limit(100);
  if (error) throw new HttpError(500, error.message);

  let sent = 0, failed = 0;
  for (const m of batch ?? []) {
    try {
      const { providerRef } = await messagingFor(m.channel).send({
        channel: m.channel, to: m.to_address, template: m.template, body: m.body, data: m.data,
      });
      await db.from('outbound_messages').update({ status: 'sent', sent_at: new Date().toISOString(), provider_ref: providerRef }).eq('id', m.id);
      sent++;
    } catch (e) {
      await db.from('outbound_messages').update({ status: 'failed', error: String((e as Error).message) }).eq('id', m.id);
      failed++;
    }
  }
  return json({ sent, failed });
});
