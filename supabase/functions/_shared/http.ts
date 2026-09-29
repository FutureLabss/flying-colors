import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Wraps a handler with CORS, JSON parsing and error mapping. */
export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      const body = req.method === 'POST' && req.headers.get('content-type')?.includes('json') ? await req.json() : {};
      return await handler(req, body);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const msg = (e as { message?: string })?.message ?? 'Something went wrong';
      console.error(e);
      return json({ error: msg }, 500);
    }
  });
}

const url = () => Deno.env.get('SUPABASE_URL')!;

/** Service-role client: bypasses RLS. Only use after checking the caller. */
export function admin(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Client acting as the caller, so RLS and role checks in RPCs apply. */
export function asCaller(req: Request): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

export function anon(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
}

export async function requireUser(req: Request): Promise<{ user: User; role: string }> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  const { data: profile } = await admin().from('profiles').select('role').eq('id', data.user.id).single();
  if (!profile) throw new HttpError(403, 'This account has no profile');
  return { user: data.user, role: profile.role as string };
}

export async function requireRole(req: Request, ...roles: string[]) {
  const who = await requireUser(req);
  if (!roles.includes(who.role)) throw new HttpError(403, 'Not allowed');
  return who;
}

/** Nigerian numbers default to +234; returns digits only (E.164 without "+"). */
export function normalisePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);
  else if (d.length === 10) d = '234' + d;
  return /^\d{10,15}$/.test(d) ? d : null;
}
