import { supabase, invokeFunction } from '@/lib/supabase';

export interface ConsentState {
  terms_privacy: boolean;
  marketing: boolean;
}

const POLICY_VERSION = import.meta.env.VITE_POLICY_VERSION ?? '2025-01';

export async function getConsents(userId: string): Promise<ConsentState> {
  const { data } = await supabase
    .from('consents')
    .select('purpose, granted, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const latest = (purpose: string) => (data ?? []).find((r) => r.purpose === purpose);
  return {
    terms_privacy: latest('terms_privacy')?.granted ?? false,
    marketing: latest('marketing')?.granted ?? false,
  };
}

/** Record a new consent decision (append-only history; latest row wins). */
export async function setConsent(
  userId: string,
  purpose: 'terms_privacy' | 'marketing',
  granted: boolean,
): Promise<void> {
  const { error } = await supabase.from('consents').insert({
    user_id: userId,
    purpose,
    granted,
    policy_version: POLICY_VERSION,
  });
  if (error) throw error;
}

export async function exportMyData(): Promise<Blob> {
  const data = await invokeFunction<Record<string, unknown>>('export-my-data', {});
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function deleteMyAccount(): Promise<void> {
  await invokeFunction('delete-my-account', {});
  await supabase.auth.signOut();
}
