// dispenser-release: hardware-facing, one-time redemption of a release token.
// Contract:
//   POST /dispenser-release
//   header: x-dispenser-secret: <DISPENSER_SHARED_SECRET>
//   body:   { "release_token": "<token>" }
//   200 -> { ok: true }                                        drop the kit
//   400 -> { ok: false, reason: invalid_token | expired | already_used }
//   401 -> { ok: false, reason: unauthorized }
//
// Atomicity: redemption is ONE UPDATE guarded by
//   WHERE release_token = $1 AND status = 'pending' AND token_expires_at > now()
// so two concurrent requests with the same token can never both succeed.
// Authenticated by the shared secret, not a user JWT (verify_jwt = false).
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, writeAudit } from '../_shared/supabaseAdmin.ts';
import { safeEqual } from '../_shared/crypto.ts';
import { requireEnv } from '../_shared/env.ts';
import { logError } from '../_shared/log.ts';

const FN = 'dispenser-release';

serve(FN, async (req, res) => {
  const secret = requireEnv('DISPENSER_SHARED_SECRET', FN);
  const provided = req.headers.get('x-dispenser-secret') ?? '';
  if (!safeEqual(provided, secret)) return res.error('unauthorized', 401);

  const { release_token } = await readJson<{ release_token?: string }>(req);
  if (!release_token || typeof release_token !== 'string') return res.error('invalid_token', 400);

  const admin = adminClient(FN);
  const nowIso = new Date().toISOString();

  // Atomic redeem.
  const { data: redeemed, error: updErr } = await admin
    .from('kit_claims')
    .update({ status: 'released', released_at: nowIso })
    .eq('release_token', release_token)
    .eq('status', 'pending')
    .gt('token_expires_at', nowIso)
    .select('id, machine_id');
  if (updErr) {
    logError(FN, 'update kit_claims (redeem)', updErr);
    return res.error('server_error', 500);
  }
  if (redeemed && redeemed.length === 1) {
    await writeAudit(admin, FN, null, 'kit_released', 'kit_claims', redeemed[0].id, {
      via: 'dispenser',
      machine_id: redeemed[0].machine_id,
    });
    return res.json({ ok: true });
  }

  // Nothing redeemed — explain why (read-only diagnosis; no second write path
  // can release the kit).
  const { data: claim, error: selErr } = await admin
    .from('kit_claims')
    .select('id, status, token_expires_at')
    .eq('release_token', release_token)
    .maybeSingle();
  if (selErr) {
    logError(FN, 'select kit_claims (diagnose)', selErr);
    return res.error('server_error', 500);
  }
  if (!claim) return res.error('invalid_token', 400);
  if (claim.status === 'released') return res.error('already_used', 400);
  if (claim.status === 'expired' || (claim.token_expires_at && new Date(claim.token_expires_at).getTime() <= Date.now())) {
    if (claim.status !== 'expired') {
      const { error: expErr } = await admin.from('kit_claims').update({ status: 'expired' }).eq('id', claim.id).eq('status', 'pending');
      if (expErr) logError(FN, 'update kit_claims (mark expired)', expErr);
    }
    return res.error('expired', 400);
  }
  return res.error('invalid_token', 400);
});
