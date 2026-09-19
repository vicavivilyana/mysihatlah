// Staging demo mode.
//
// DEMO_MODE=true lets a demo be given when no SMS provider is wired up: it
// relaxes ONLY the final code comparison in otp-verify. Everything else —
// the OTP row must exist and be unused, expiry, the 5-attempt cap, the
// rate limit, the HMAC hashing, session + profile creation — runs exactly as
// in production. A caller still has to call otp-request first.
//
// SECURITY: with DEMO_MODE=true anyone can sign in as ANY phone number.
// It must be false for real users. Server-side only; never a VITE_ var.
import { optionalEnv } from './env.ts';

/** The fixed code accepted in demo mode, in addition to the real one. */
export const DEMO_CODE = '000000';

export function isDemoMode(): boolean {
  return (optionalEnv('DEMO_MODE') ?? 'false').toLowerCase() === 'true';
}
