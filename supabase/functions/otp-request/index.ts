// otp-request: issue a short-lived, HMAC-hashed, rate-limited OTP.
// Public (verify_jwt = false) — the user has no session yet.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, writeAudit } from '../_shared/supabaseAdmin.ts';
import { hashOtp, generateOtp } from '../_shared/crypto.ts';
import { getOtpProvider, isDevProvider } from '../_shared/otp/index.ts';
import { normalizePhone, E164 } from '../_shared/phone.ts';
import { logError } from '../_shared/log.ts';

const FN = 'otp-request';
const OTP_TTL_SECONDS = 300; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_PER_HOUR = 5;

serve(FN, async (req, res) => {
  const { name, email, phone } = await readJson<{ name?: string; email?: string; phone?: string }>(req);
  if (!phone || !name) return res.error('missing_fields', 400);
  const normPhone = normalizePhone(phone);
  if (!E164.test(normPhone)) return res.error('invalid_phone', 400);

  const admin = adminClient(FN);
  const now = Date.now();

  // Rate limiting: 30s cooldown between sends, max 5 per rolling hour.
  const { data: recent, error: recentErr } = await admin
    .from('otp_codes')
    .select('created_at')
    .eq('phone', normPhone)
    .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  if (recentErr) {
    logError(FN, 'select otp_codes (rate limit)', recentErr);
    return res.error('server_error', 500);
  }
  if (recent && recent.length > 0) {
    const lastMs = new Date(recent[0].created_at).getTime();
    if (now - lastMs < RESEND_COOLDOWN_SECONDS * 1000) return res.error('rate_limited', 429);
    if (recent.length >= MAX_PER_HOUR) return res.error('rate_limited', 429);
  }

  const code = generateOtp();
  const code_hash = await hashOtp(code, normPhone, FN);
  const expires_at = new Date(now + OTP_TTL_SECONDS * 1000).toISOString();

  const { error: insErr } = await admin.from('otp_codes').insert({
    phone: normPhone,
    code_hash,
    name: String(name).slice(0, 120),
    email: email ? String(email).slice(0, 200) : null,
    expires_at,
  });
  if (insErr) {
    logError(FN, 'insert otp_codes', insErr);
    return res.error('server_error', 500);
  }

  const provider = getOtpProvider();
  let devCode: string | undefined;
  try {
    const result = await provider.send(normPhone, code);
    devCode = isDevProvider(provider) ? result.devCode : undefined;
  } catch (e) {
    logError(FN, `provider ${provider.name} send`, e);
    return res.error('server_error', 500);
  }

  await writeAudit(admin, FN, null, 'otp_requested', 'otp_codes', normPhone, { provider: provider.name });

  return res.json({ ok: true, resendAfter: RESEND_COOLDOWN_SECONDS, devCode });
});
