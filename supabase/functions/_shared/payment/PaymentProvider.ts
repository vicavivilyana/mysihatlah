// Deposit payment providers.
//
// TODAY: MockPaymentProvider only — an explicit demo path, clearly labelled in
// the UI. NO real gateway is contacted anywhere in this build.
// LATER:  FiuuPaymentProvider (Fiuu, formerly Razer Merchant Services).
//
// Selected server-side by PAYMENT_PROVIDER (mock|fiuu, default mock) so a
// client can never assert "fiuu paid" while fiuu is unwired.
import { optionalEnv, requireEnv } from '../env.ts';

export interface PaymentIntent {
  userId: string;
  claimId: string;
  amountCents: number;
  currency: string;
}

export interface PaymentResult {
  ok: boolean;
  /** Gateway reference stored on the deposit row for reconciliation. */
  providerRef: string;
  provider: string;
}

export interface PaymentProvider {
  readonly name: string;
  /**
   * Confirm that a deposit has actually been paid.
   * For a real gateway this MUST verify server-side (signature/callback
   * lookup) — never trust a "paid" claim coming from the client.
   */
  confirmPayment(intent: PaymentIntent, clientRef?: string): Promise<PaymentResult>;
}

/** Demo path: succeeds immediately. No money moves. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  confirmPayment(intent: PaymentIntent): Promise<PaymentResult> {
    const ref = `mock_${intent.claimId.slice(0, 8)}_${Date.now()}`;
    console.log(`[payment/mock] simulated deposit of ${intent.amountCents} ${intent.currency} (ref ${ref})`);
    return Promise.resolve({ ok: true, providerRef: ref, provider: 'mock' });
  }
}

/**
 * ============================ STUB — NOT IMPLEMENTED ======================
 * Fiuu (Razer Merchant Services) deposit payment.
 *
 * Nothing here contacts Fiuu. When the merchant account exists, implement
 * confirmPayment as a SERVER-SIDE verification:
 *   1. The client is sent to Fiuu's hosted payment page (a separate
 *      create-payment endpoint builds the request and signs it with
 *      FIUU_VERIFY_KEY).
 *   2. Fiuu calls back / the app returns with a transaction id.
 *   3. HERE: re-query Fiuu's Transaction Status / Requery API with
 *      FIUU_MERCHANT_ID + FIUU_SECRET_KEY and verify the returned signature
 *      and amount before returning ok:true.
 * Never mark a deposit paid on the strength of a client-supplied flag.
 * ==========================================================================
 */
export class FiuuPaymentProvider implements PaymentProvider {
  readonly name = 'fiuu';
  confirmPayment(_intent: PaymentIntent, _clientRef?: string): Promise<PaymentResult> {
    // Present so the wiring is obvious; intentionally unused until implemented.
    requireEnv('FIUU_MERCHANT_ID', 'payment/fiuu');
    throw new Error(
      'fiuu_payment_not_implemented: no Fiuu integration exists in this build. ' +
        'Implement server-side verification against the Fiuu Transaction Status API before enabling PAYMENT_PROVIDER=fiuu.',
    );
  }
}

export function getPaymentProvider(): PaymentProvider {
  const choice = (optionalEnv('PAYMENT_PROVIDER') ?? 'mock').toLowerCase();
  if (choice === 'fiuu') return new FiuuPaymentProvider();
  if (choice !== 'mock') {
    console.error(`[payment] Unknown PAYMENT_PROVIDER "${choice}" — expected "mock" or "fiuu". Falling back to mock.`);
  }
  return new MockPaymentProvider();
}
