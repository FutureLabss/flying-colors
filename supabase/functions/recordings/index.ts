// Looks up the Zoom cloud recording for a finished live session.
//   { session_id } → { recording_url, recording_minutes } | { recording_url: null }
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts';
import { recordings } from '../_shared/providers.ts';

serve(async (req, body) => {
  const { user, role } = await requireUser(req);
  const db = admin();
  const { data: ses } = await db.from('live_sessions')
    .select('id, starts_at, ends_at, recording_url, recording_minutes, classes(tutor_id, zoom_url)')
    .eq('id', body.session_id).single();
  if (!ses) throw new HttpError(404, 'Session not found');
  const cls = ses.classes as unknown as { tutor_id: string; zoom_url: string | null };
  if (!['owner', 'lead_tutor'].includes(role) && cls.tutor_id !== user.id) throw new HttpError(403, 'Not allowed');
  if (ses.recording_url) return json({ recording_url: ses.recording_url, recording_minutes: ses.recording_minutes });

  const found = await recordings().find({ zoomUrl: cls.zoom_url, startsAt: ses.starts_at, endsAt: ses.ends_at });
  if (!found) return json({ recording_url: null });
  await db.from('live_sessions').update({
    recording_url: found.url, recording_minutes: found.minutes, recording_found_at: new Date().toISOString(),
  }).eq('id', ses.id);
  return json({ recording_url: found.url, recording_minutes: found.minutes });
});
