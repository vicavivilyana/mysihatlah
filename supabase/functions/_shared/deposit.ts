/** Deposit amount is server-owned so the client can never choose what it pays. */
import { optionalEnv } from './env.ts';

export const DEPOSIT_CURRENCY = 'MYR';
export function depositAmountCents(): number {
  const raw = Number(optionalEnv('DEPOSIT_AMOUNT_CENTS') ?? '2000');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2000; // RM20.00
}
/** One-time release token lifetime once the deposit is paid. */
export const RELEASE_TOKEN_TTL_SECONDS = 60;
