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

/** The caller's own claim row (RLS scopes this to their own row only). */
export interface KitClaimRow {
  status: ClaimStatus;
  release_token: string | null;
  token_expires_at: string | null;
  hospital_id: string | null;
  machine_id: string | null;
}

/**
 * Read the caller's claim. Returning the token as well as the status means the
 * app can RE-DISPLAY an existing, still-valid QR instead of minting a new one
 * every time the Kit tab is opened (which rotated the token and wrote an audit
 * row on each visit).
 */
export async function getMyClaim(): Promise<KitClaimRow | null> {
  const { data, error } = await supabase
    .from('kit_claims')
    .select('status, release_token, token_expires_at, hospital_id, machine_id')
    .maybeSingle();
  if (error) throw error;
  return (data as KitClaimRow) ?? null;
}

/** Status-only convenience (used by Home and the redemption poll). */
export async function getClaimStatus(): Promise<ClaimStatus> {
  const claim = await getMyClaim();
  return claim?.status ?? 'none';
}

/** Normalised shape the QR screen renders, from either source. */
export interface ReleaseView {
  token: string;
  tokenExpiresAt: string;
  issuedAt: string;
  hospitalId: string;
  machineId: string;
  hospitalName?: string;
  locationName?: string;
}

export const TOKEN_TTL_MS = 5 * 60 * 1000; // matches claim-kit's TOKEN_TTL_SECONDS

export function viewFromClaimResult(r: ClaimKitResult): ReleaseView {
  return {
    token: r.release_token,
    tokenExpiresAt: r.token_expires_at,
    issuedAt: r.issued_at,
    hospitalId: r.machine.hospital_id,
    machineId: r.machine.machine_id,
    hospitalName: r.machine.hospital_name,
    locationName: r.machine.location_name,
  };
}

export function viewFromRow(row: KitClaimRow): ReleaseView | null {
  if (!row.release_token || !row.token_expires_at) return null;
  // issued_at isn't stored; derive it from the expiry so the payload stays complete.
  const issued = new Date(new Date(row.token_expires_at).getTime() - TOKEN_TTL_MS).toISOString();
  return {
    token: row.release_token,
    tokenExpiresAt: row.token_expires_at,
    issuedAt: issued,
    hospitalId: row.hospital_id ?? '',
    machineId: row.machine_id ?? '',
  };
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
