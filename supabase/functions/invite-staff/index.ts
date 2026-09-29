// Owner invites a staff member by email.
//   { email, full_name, display_name, role } → { id }
import { admin, HttpError, json, requireRole, serve } from '../_shared/http.ts';

const ROLES = ['owner', 'lead_tutor', 'customer_service', 'tutor'];
const LABEL: Record<string, string> = { owner: 'Owner', lead_tutor: 'Lead tutor', customer_service: 'Customer service', tutor: 'Tutor' };

serve(async (req, body) => {
  const { user } = await requireRole(req, 'owner');
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const fullName = String(body.full_name ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Pick a role');
  if (!fullName) throw new HttpError(400, 'Enter their name');

  const db = admin();
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, display_name: String(body.display_name ?? '').trim() || fullName },
  });
  if (error) throw new HttpError(400, error.message);
  await db.auth.admin.updateUserById(data.user.id, { app_metadata: { role } });
  await db.from('profiles').update({ role, two_factor: false }).eq('id', data.user.id);

  const { data: me } = await db.from('profiles').select('display_name, full_name').eq('id', user.id).single();
  await db.from('audit_log').insert({
    actor_id: user.id, actor_name: me?.display_name || me?.full_name || 'Owner', actor_role: 'Owner',
    action: 'Invited staff', target: `${fullName} · ${LABEL[role]}`,
  });
  return json({ id: data.user.id });
});
