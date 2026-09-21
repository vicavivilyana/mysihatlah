import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, invokeFunction } from '@/lib/supabase';
import { PREVIEW_MODE, PREVIEW_GUEST } from '@/lib/previewMode';

export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  lang: string | null;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True only under the VITE_SKIP_AUTH UI-preview bypass (no real session). */
  isPreview: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(current: Session | null) {
    if (!current) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone, email, lang')
      .eq('id', current.user.id)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadProfile(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Preview bypass: a clearly-fake local identity so screens can render. There
  // is deliberately NO session, so every backend call still fails as normal.
  const isPreview = PREVIEW_MODE && !session;

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: isPreview ? (PREVIEW_GUEST as unknown as Profile) : profile,
      loading,
      isPreview,
      refreshProfile: () => loadProfile(session),
      logout: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading, isPreview],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// --- OTP API (thin client over Edge Functions) --------------------------------

export interface OtpRequestResult {
  ok: boolean;
  /** Present only in dev/mock mode so the pilot is testable without SMS. */
  devCode?: string;
  resendAfter?: number;
}

export async function requestOtp(name: string, email: string, phone: string): Promise<OtpRequestResult> {
  return invokeFunction<OtpRequestResult>('otp-request', { name, email, phone });
}

export interface OtpVerifyResult {
  access_token: string;
  refresh_token: string;
}

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const res = await invokeFunction<OtpVerifyResult>('otp-verify', { phone, code });
  const { error } = await supabase.auth.setSession({
    access_token: res.access_token,
    refresh_token: res.refresh_token,
  });
  if (error) throw error;
}
