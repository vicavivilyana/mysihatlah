// return-powerbank: power bank returned -> RM20 deposit refunded.
//
// ============================== DEMO PATH =================================
// In production the RETURN is asserted by the physical RFID dropbox, not by
// the phone. That belongs behind a shared secret exactly like
// dispenser-release (header `x-dropbox-secret`), so a user cannot self-declare
// a return and refund themselves. No RFID hardware or vendor endpoint is
// faked here.
//
// Today this endpoint accepts the user's own JWT and runs a MOCK refund, so
// the app-side flow can be demonstrated end to end. It is clearly labelled as
// a demo in the UI.
// ==========================================================================
import { serve } from '../_shared/serve.ts';
import { adminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { getRefundProvider } from '../_shared/refund/RefundProvider.ts';
import { logError } from '../_shared/log.ts';

const FN = 'return-powerbank';

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const admin = adminClient(FN);

  // The deposit to reverse (owner-scoped; service role reads it directly).
  const { data: dep, error: depErr } = await admin
    .from('deposits')
    .select('id, amount_cents, provider_ref, status')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .maybeSingle();
  if (depErr) {
    logError(FN, 'select deposits', depErr);
    return res.error('server_error', 500);
  }
  if (!dep) return res.error('no_deposit', 404);

  const refunder = getRefundProvider();
  try {
    const result = await refunder.refund({
      userId,
      depositId: dep.id,
      amountCents: dep.amount_cents,
      providerRef: dep.provider_ref,
    });
    if (!result.ok) return res.error('refund_failed', 502);
  } catch (e) {
    logError(FN, `refund provider ${refunder.name}`, e);
    return res.error('refund_failed', 502);
  }

  const { data, error } = await admin.rpc('refund_deposit', {
    p_user_id: userId,
    p_method: refunder.name,
  });
  if (error) {
    const msg = error.message ?? '';
    if (/not_dispensed/.test(msg)) return res.error('not_dispensed', 409);
    if (/no_deposit/.test(msg)) return res.error('no_deposit', 404);
    logError(FN, 'rpc refund_deposit', error);
    return res.error('server_error', 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    deposit_id?: string; status?: string; refunded_at?: string; amount_cents?: number;
  };
  return res.json({
    ok: true,
    deposit: {
      id: row?.deposit_id,
      status: row?.status ?? 'refunded',
      refunded_at: row?.refunded_at,
      amount_cents: row?.amount_cents ?? dep.amount_cents,
      method: refunder.name,
    },
  });
});
