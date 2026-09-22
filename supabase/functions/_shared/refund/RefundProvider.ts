// Deposit refund providers (power bank returned → RM20 back).
//
// TODAY: MockRefundProvider only — an explicit demo path.
// LATER:  FiuuRefundProvider, plus a real RFID dropbox signal.
//
// NOTE on the dropbox: in production the RETURN is asserted by the physical
// RFID dropbox, not by the phone. That belongs in its own endpoint
// (see `return-powerbank`), authenticated with a shared secret like
// dispenser-release, so a user cannot self-declare a return. The mock path in
// this build is explicitly a demo and is labelled as such in the UI.
import { optionalEnv, requireEnv } from '../env.ts';

export interface RefundRequest {
  userId: string;
  depositId: string;
  amountCents: number;
  /** Original payment reference, needed by a real gateway. */
  providerRef: string | null;
}

export interface RefundResult {
  ok: boolean;
  method: string;
  providerRef?: string;
}

export interface RefundProvider {
  readonly name: string;
  refund(req: RefundRequest): Promise<RefundResult>;
}

/** Demo path: succeeds immediately. No money moves. */
export class MockRefundProvider implements RefundProvider {
  readonly name = 'mock';
  refund(req: RefundRequest): Promise<RefundResult> {
    console.log(`[refund/mock] simulated refund of ${req.amountCents} for deposit ${req.depositId}`);
    return Promise.resolve({ ok: true, method: 'mock' });
  }
}

/**
 * ============================ STUB — NOT IMPLEMENTED ======================
 * Fiuu refund. Implement against Fiuu's Refund API using FIUU_MERCHANT_ID +
 * FIUU_SECRET_KEY, passing the original transaction id held in
 * deposits.provider_ref. Refunds are asynchronous — expect a callback and
 * reconcile before marking the row refunded.
 * ==========================================================================
 */
export class FiuuRefundProvider implements RefundProvider {
  readonly name = 'fiuu';
  refund(_req: RefundRequest): Promise<RefundResult> {
    requireEnv('FIUU_MERCHANT_ID', 'refund/fiuu');
    throw new Error(
      'fiuu_refund_not_implemented: no Fiuu integration exists in this build. ' +
        'Implement the Fiuu Refund API call before enabling PAYMENT_PROVIDER=fiuu.',
    );
  }
}

export function getRefundProvider(): RefundProvider {
  const choice = (optionalEnv('PAYMENT_PROVIDER') ?? 'mock').toLowerCase();
  if (choice === 'fiuu') return new FiuuRefundProvider();
  return new MockRefundProvider();
}
