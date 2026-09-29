import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabase } from './supabase';

type Fns = Database['public']['Functions'];

/** Calls a Postgres RPC and throws its error message. */
export async function rpc<T = unknown, N extends keyof Fns = keyof Fns>(name: N, args?: Fns[N]['Args']): Promise<T> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Calls an edge function and throws the `error` it returns. */
export async function fn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? error.message);
    }
    throw new Error(error.message);
  }
  return data as T;
}

/** Throws a Supabase query error (or a missing row); returns data otherwise. */
export function must<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message);
  if (res.data == null) throw new Error('Not found');
  return res.data as NonNullable<R['data']>;
}

/** Signed URL for a private storage object (15-minute expiry, like the product promises). */
export async function signedUrl(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 15 * 60);
  return data?.signedUrl ?? null;
}
