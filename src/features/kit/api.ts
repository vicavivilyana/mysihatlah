import { supabase, invokeFunction } from '@/lib/supabase';

export interface SurveyAnswers {
  q1_for_whom: string;
  q2_age: string;
  q3_department: string;
  q4_need: string;
  q4_other_text?: string;
  terms_accepted: boolean; // mandatory
  marketing_opt_in: boolean; // optional
}

export interface ClaimKitResult {
  ok: true;
  /** true when this token re-displays an existing, undispensed claim. */
  reissued: boolean;
  release_token: string;
  token_expires_at: string;
  issued_at: string;
  machine: {
    machine_id: string;
    location_name: string;
    hospital_id: string;
    hospital_name: string;
  };
}

export type ClaimStatus = 'none' | 'pending' | 'released' | 'expired';

/**
 * Which machine this claim draws stock from. There is no scan step any more,
 * so the machine comes from config (single-dispenser pilot). Change this env
 * var — or add a picker here — when a hospital runs several machines.
 */
export const DEFAULT_MACHINE_ID = import.meta.env.VITE_DEFAULT_MACHINE_ID?.trim() || 'HG-TEST-000';

/**
 * The caller's own claim, read under RLS (a user can only ever see their own
 * row). This doubles as the redemption poll: once the machine redeems the
 * token, dispenser-release sets status='released'.
 */
export async function getClaimStatus(): Promise<ClaimStatus> {
  const { data, error } = await supabase.from('kit_claims').select('status').maybeSingle();
  if (error) throw error;
  if (!data) return 'none';
  return (data.status as ClaimStatus) ?? 'none';
}

/** First claim: records survey + consents, decrements stock, returns a token. */
export async function claimKit(survey: SurveyAnswers): Promise<ClaimKitResult> {
  return invokeFunction<ClaimKitResult>('claim-kit', {
    machine_id: DEFAULT_MACHINE_ID,
    scanned_at: new Date().toISOString(),
    survey,
  });
}

/**
 * Fresh token for an existing, UNDISPENSED claim (code expired, app reopened).
 * Server-side this can never create a second claim or move stock; once the kit
 * is physically released it responds already_claimed.
 */
export async function reissueReleaseToken(): Promise<ClaimKitResult> {
  return invokeFunction<ClaimKitResult>('claim-kit', { reissue: true });
}
