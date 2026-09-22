// finalize-claim: STAGE B — confirm the RM20 deposit, then issue the QR.
//
// One atomic step (finalize_kit_claim): authoritative stock check + guarded
// decrement, one-time 60s release token, deposit row, audit entries.
//
// The amount is server-owned and the payment is confirmed through the
// server-selected PaymentProvider — the client cannot choose what it pays or
// assert that it paid. With PAYMENT_PROVIDER=mock this is an explicit demo
// path; with fiuu it will re-verify against the gateway before finalizing.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { generateToken } from '../_shared/crypto.ts';
import { DEPOSIT_CURRENCY, depositAmountCents, RELEASE_TOKEN_TTL_SECONDS } from '../_shared/deposit.ts';
import { getPaymentProvider } from '../_shared/payment/PaymentProvider.ts';
import { logError } from '../_shared/log.ts';

const FN = 'finalize-claim';

interface Row {
  claim_id?: string;
  machine_id?: string;
  location_name?: string;
  hospital_id?: string;
  hospital_name?: string;
  deposit_id?: string;
}

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const body = await readJson<{ claim_id?: string; payment_ref?: string }>(req);
  const admin = adminClient(FN);
  const amountCents = depositAmountCents();
  const provider = getPaymentProvider();

  // 1) Confirm payment. A real provider verifies server-side; the mock simply
  //    succeeds and is labelled as a demo in the UI.
  let paymentRef: string;
  try {
    const result = await provider.confirmPayment(
      { userId, claimId: body.claim_id ?? '', amountCents, currency: DEPOSIT_CURRENCY },
      body.payment_ref,
    );
    if (!result.ok) return res.error('payment_failed', 402);
    paymentRef = result.providerRef;
  } catch (e) {
    logError(FN, `payment provider ${provider.name}`, e);
    return res.error('payment_failed', 402);
  }

  // 2) Finalize atomically.
  const token = generateToken();
  const issuedAt = new Date().toISOString();
  const tokenExpires = new Date(Date.now() + RELEASE_TOKEN_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await admin.rpc('finalize_kit_claim', {
    p_user_id: userId,
    p_token: token,
    p_token_expires: tokenExpires,
    p_provider: provider.name,
    p_amount_cents: amountCents,
    p_provider_ref: paymentRef,
  });

  if (error) {
    const msg = error.message ?? '';
    if (/already_claimed/.test(msg)) return res.error('already_claimed', 409);
    if (/already_finalized/.test(msg)) return res.error('already_finalized', 409);
    if (/out_of_stock/.test(msg)) return res.error('out_of_stock', 409);
    if (/invalid_machine/.test(msg)) return res.error('invalid_machine', 400);
    if (/no_claim/.test(msg)) return res.error('no_claim', 404);
    logError(FN, 'rpc finalize_kit_claim', error);
    return res.error('server_error', 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) as Row;
  return res.json({
    ok: true,
    stage: 'finalized',
    release_token: token,
    token_expires_at: tokenExpires,
    issued_at: issuedAt,
    deposit: { id: row?.deposit_id, amount_cents: amountCents, currency: DEPOSIT_CURRENCY, status: 'paid', provider: provider.name },
    machine: {
      machine_id: row?.machine_id ?? '',
      location_name: row?.location_name ?? '',
      hospital_id: row?.hospital_id ?? '',
      hospital_name: row?.hospital_name ?? '',
    },
  });
});
