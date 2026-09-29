import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  // Show the problem instead of a blank page (e.g. a deploy without env vars).
  document.body.innerHTML = '<p style="font:16px system-ui;color:#fff;padding:24px">Flying Colours isn’t configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this build, then redeploy.</p>';
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see web/.env.example).');
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fc-auth' },
});
