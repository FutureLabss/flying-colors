import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Database } from './database.types';
import { supabase } from './supabase';

export type Role = Database['public']['Enums']['app_role'];
export type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'role' | 'full_name' | 'display_name' | 'phone' | 'email'>;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const OFFICE: Role[] = ['owner', 'lead_tutor', 'customer_service'];
export const STAFF: Role[] = [...OFFICE, 'tutor'];

/** Where each role lands after signing in. */
export function homeFor(role: Role | undefined): string {
  switch (role) {
    case 'parent': return '/parent';
    case 'learner': return '/learn/week';
    case 'tutor': return '/tutor';
    case 'owner': case 'lead_tutor': case 'customer_service': return '/admin';
    default: return '/signin';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from('profiles')
      .select('id, role, full_name, display_name, phone, email').eq('id', s.user.id).single();
    setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock the client.
        setTimeout(async () => {
          await loadProfile(s);
          if (event !== 'USER_UPDATED') qc.clear();
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile, qc]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading,
    signOut: async () => { await supabase.auth.signOut(); },
    // Read the live session: callers often run right after signing in, before this render has it.
    refreshProfile: async () => { const { data } = await supabase.auth.getSession(); await loadProfile(data.session); },
  }), [session, profile, loading, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Guards a route by role; sends others to their own home or sign-in. */
export function RequireRole({ roles, children, signin = '/signin' }: { roles: Role[]; children: ReactNode; signin?: string }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading || (session && !profile)) return <div className="full-center">Loading…</div>;
  if (!session || !profile) return <Navigate to={signin} replace state={{ from: loc.pathname }} />;
  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}

// ─── learner device ───────────────────────────────────────────────────────
// A parent sets a device up once; children then pick their name and type a PIN.
const DEVICE_KEY = 'fc-device';
export const deviceToken = {
  get: (): string | null => { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(DEVICE_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(DEVICE_KEY); } catch { /* private mode */ } },
};
