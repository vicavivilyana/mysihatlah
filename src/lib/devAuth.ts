import { requestOtp, verifyOtp } from '@/store/auth';

/**
 * DEV AUTO-LOGIN — convenience only, never a replacement for auth.
 *
 * Authentication is NOT removed: every feature needs a real Supabase session
 * because RLS scopes all data by auth.uid(). This just signs you in silently
 * as a fixed demo user using the existing mock-OTP flow, so you can open the
 * app and try features without typing a code each time.
 *
 * Requires OTP_PROVIDER=mock (the server must return devCode). It fails loudly
 * and falls back to the normal login screen otherwise.
 *
 * MUST be off in production: set VITE_DEV_AUTOLOGIN=false (it is off unless
 * explicitly enabled).
 */
export const DEV_AUTOLOGIN = import.meta.env.VITE_DEV_AUTOLOGIN === 'true';

const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@mysihatlah.local',
  phone: '+60100000001',
};

export async function devAutoLogin(): Promise<void> {
  const res = await requestOtp(DEMO_USER.name, DEMO_USER.email, DEMO_USER.phone);
  if (!res.devCode) {
    throw new Error(
      'dev auto-login requires the mock OTP provider (OTP_PROVIDER=mock) so the code can be returned to the client',
    );
  }
  await verifyOtp(DEMO_USER.phone, res.devCode);
}
