// claim-kit: one-per-user welcome-kit claim, returning a one-time release
// token that the APP RENDERS AS A QR for the vending machine to scan.
//
// Two modes:
//   * normal  — validates the JWT, requires mandatory consent, encrypts the
//     sensitive survey fields, then delegates everything transactional
//     (existing-claim check, machine lock, stock guard, claim + survey +
//     consents, stock decrement, audit) to claim_welcome_kit().
//   * reissue — { reissue: true } mints a FRESH token on the user's existing
//     UNDISPENSED claim (expired code, app reopened). It never decrements
//     stock and never creates a second claim, so it cannot yield a second kit;
//     once the kit is physically released it returns already_claimed.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { encryptField, generateToken } from '../_shared/crypto.ts';
import { requireEnv } from '../_shared/env.ts';
import { logError } from '../_shared/log.ts';

const FN = 'claim-kit';
const TOKEN_TTL_SECONDS = 300; // ~5 minutes

interface Survey {
  q1_for_whom?: string;
  q2_age?: string;
  q3_department?: string;
  q4_need?: string;
  q4_other_text?: string | null;
  terms_accepted?: boolean;
  marketing_opt_in?: boolean;
}
interface Body {
  machine_id?: string;
  hospital_id?: string | null;
  location?: string | null;
  issued_at?: string | null;
  scanned_at?: string | null;
  reissue?: boolean;
  survey?: Survey;
}

interface ClaimRow {
  claim_id?: string;
  machine_id?: string;
  location_name?: string;
  hospital_id?: string;
  hospital_name?: string;
}

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const body = await readJson<Body>(req);
  const admin = adminClient(FN);

  const token = generateToken();
  const issuedAt = new Date().toISOString();
  const tokenExpires = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  let row: ClaimRow | undefined;
  let reissued = false;

  if (body.reissue === true) {
    // --- Re-display path: same claim, fresh token ---------------------------
    const { data, error } = await admin.rpc('reissue_release_token', {
      p_user_id: userId,
      p_token: token,
      p_token_expires: tokenExpires,
    });
    if (error) {
      const msg = error.message ?? '';
      if (/already_dispensed/.test(msg)) return res.error('already_claimed', 409);
      if (/no_claim/.test(msg)) return res.error('no_claim', 404);
      logError(FN, 'rpc reissue_release_token', error);
      return res.error('server_error', 500);
    }
    row = (Array.isArray(data) ? data[0] : data) as ClaimRow;
    reissued = true;
  } else {
    // --- First claim path ---------------------------------------------------
    const survey = body.survey ?? {};
    if (survey.terms_accepted !== true) return res.error('terms_required', 400);
    if (!body.machine_id) return res.error('invalid_machine', 400);

    const policyVersion = requireEnv('POLICY_VERSION', FN);
    const q3_enc = await encryptField(String(survey.q3_department ?? ''), FN);
    const q4_enc = await encryptField(String(survey.q4_need ?? ''), FN);
    const q4other_enc = await encryptField(survey.q4_other_text ?? null, FN);

    const { data, error } = await admin.rpc('claim_welcome_kit', {
      p_user_id: userId,
      p_machine_code: String(body.machine_id).toUpperCase(),
      p_hospital_id: body.hospital_id ?? null,
      p_location: body.location ?? null,
      p_issued_at: body.issued_at ?? null,
      p_scanned_at: body.scanned_at ?? issuedAt,
      p_q1: survey.q1_for_whom ?? null,
      p_q2: survey.q2_age ?? null,
      p_q3_enc: q3_enc,
      p_q4_enc: q4_enc,
      p_q4other_enc: q4other_enc,
      p_marketing_opt_in: survey.marketing_opt_in === true,
      p_policy_version: policyVersion,
      p_token: token,
      p_token_expires: tokenExpires,
    });

    if (error) {
      const msg = error.message ?? '';
      // Business outcomes raised by the SQL function → clean client reasons.
      if (/already_claimed/.test(msg)) return res.error('already_claimed', 409);
      if (/out_of_stock/.test(msg)) return res.error('out_of_stock', 409);
      if (/invalid_machine/.test(msg)) return res.error('invalid_machine', 400);
      logError(FN, 'rpc claim_welcome_kit', error);
      return res.error('server_error', 500);
    }
    row = (Array.isArray(data) ? data[0] : data) as ClaimRow;
  }

  return res.json({
    ok: true,
    reissued,
    release_token: token,
    token_expires_at: tokenExpires,
    issued_at: issuedAt,
    machine: {
      machine_id: row?.machine_id ?? body.machine_id ?? '',
      location_name: row?.location_name ?? body.location ?? '',
      hospital_id: row?.hospital_id ?? body.hospital_id ?? '',
      hospital_name: row?.hospital_name ?? '',
    },
  });
});
