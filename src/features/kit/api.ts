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

export interface MachineInfo {
  machine_id: string;
  location_name: string;
  hospital_id: string;
  hospital_name: string;
}

/** Stage A — claim reserved, awaiting the deposit. No token yet. */
export interface PendingClaimResult {
  ok: true;
  stage: 'pending';
  resumed: boolean;
  claim_id: string;
  deposit: { amount_cents: number; currency: string };
  machine: MachineInfo;
}

/** Stage B — deposit paid, one-time 60s QR token issued. */
export interface ClaimKitResult {
  ok: true;
  stage: 'finalized';
  reissued?: boolean;
  release_token: string;
  token_expires_at: string;
  issued_at: string;
  deposit?: { id?: string; amount_cents: number; currency: string; status: string; provider: string };
  machine: MachineInfo;
}

export type DepositStatus = 'none' | 'paid' | 'refunded' | 'failed';

export interface DepositRow {
  id: string;
  amount_cents: number;
  currency: string;
  status: Exclude<DepositStatus, 'none'>;
  provider: string;
  refund_method: string | null;
  paid_at: string | null;
  refunded_at: string | null;
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

export const TOKEN_TTL_MS = 60 * 1000; // matches RELEASE_TOKEN_TTL_SECONDS

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

/**
 * STAGE A — survey submit. Records survey + consents and reserves the claim as
 * PENDING. No stock is taken and no QR is issued until the deposit is paid, so
 * abandoning at payment is free and resumable.
 */
export async function createPendingClaim(survey: SurveyAnswers): Promise<PendingClaimResult> {
  return invokeFunction<PendingClaimResult>('claim-kit', {
    machine_id: DEFAULT_MACHINE_ID,
    scanned_at: new Date().toISOString(),
    survey,
  });
}

/** STAGE B — deposit paid; issues the one-time 60s release token. */
export async function finalizeClaim(claimId: string, paymentRef?: string): Promise<ClaimKitResult> {
  return invokeFunction<ClaimKitResult>('finalize-claim', {
    claim_id: claimId,
    payment_ref: paymentRef,
  });
}

/** Read the caller's deposit (RLS: own row only). */
export async function getMyDeposit(): Promise<DepositRow | null> {
  const { data, error } = await supabase
    .from('deposits')
    .select('id, amount_cents, currency, status, provider, refund_method, paid_at, refunded_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DepositRow) ?? null;
}

/** MOCK power-bank return → deposit refund. Demo path; see return-powerbank. */
export async function returnPowerBank(): Promise<{ ok: true; deposit: DepositRow & { method: string } }> {
  return invokeFunction('return-powerbank', {});
}

/**
 * Fresh token for an existing, PAID and undispensed claim (code expired, app
 * reopened). Never creates a second claim, never moves stock, and the server
 * refuses with `payment_required` if the deposit has not been paid.
 */
export async function reissueReleaseToken(): Promise<ClaimKitResult> {
  return invokeFunction<ClaimKitResult>('claim-kit', { reissue: true });
}
