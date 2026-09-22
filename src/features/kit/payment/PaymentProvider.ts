/**
 * Client-side deposit payment.
 *
 * TODAY: MockPaymentProvider — a labelled demo button. No gateway is contacted.
 * LATER: FiuuPaymentProvider (Fiuu / Razer Merchant Services) will redirect to
 *        the hosted payment page and return a transaction reference, which the
 *        server re-verifies before finalizing. The server also selects the
 *        provider (PAYMENT_PROVIDER), so this class cannot be used to assert
 *        that a payment happened.
 */
export interface PaymentAttempt {
  claimId: string;
  amountCents: number;
  currency: string;
}

export interface PaymentOutcome {
  ok: boolean;
  /** Reference passed to finalize-claim; the server re-verifies it for real providers. */
  ref?: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** True when the UI must label this as a simulation. */
  readonly isMock: boolean;
  pay(attempt: PaymentAttempt): Promise<PaymentOutcome>;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isMock = true;
  async pay(attempt: PaymentAttempt): Promise<PaymentOutcome> {
    // Brief pause so the UI shows its pending state; nothing is charged.
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, ref: `mock_client_${attempt.claimId.slice(0, 8)}` };
  }
}

/**
 * ======================== STUB — NOT IMPLEMENTED ==========================
 * Fiuu hosted payment. To implement:
 *   1. POST to a new `create-payment` Edge Function to build + sign the Fiuu
 *      request server-side (never sign in the browser).
 *   2. Redirect to Fiuu's payment page.
 *   3. On return, pass the transaction id to finalize-claim, which re-queries
 *      Fiuu server-side before issuing the QR.
 * ==========================================================================
 */
export class FiuuPaymentProvider implements PaymentProvider {
  readonly name = 'fiuu';
  readonly isMock = false;
  pay(_attempt: PaymentAttempt): Promise<PaymentOutcome> {
    throw new Error('fiuu_payment_not_implemented');
  }
}

/** Mock is the only usable provider in this build. */
export function getPaymentProvider(): PaymentProvider {
  return new MockPaymentProvider();
}
