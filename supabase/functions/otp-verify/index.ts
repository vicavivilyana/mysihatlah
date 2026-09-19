// otp-verify: verify the code, then mint a REAL Supabase session for the
// phone-identified user — without any SMS provider enabled in Supabase Auth.
//
// Session minting: the user's auth identity is a deterministic email derived
// from the phone (identityEmailFor). We ensure the user exists via the Admin
// API, then `generateLink({ type: 'magiclink' })` (admin; sends nothing) and
// redeem its hashed token with `verifyOtp({ token_hash, type: 'magiclink' })`
// on an anon client, which returns access/refresh tokens. No password, no SMS,
// works identically on local and hosted. Returning users simply sign in.
//
// Public (verify_jwt = false) — this endpoint issues the session.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, anonClient, writeAudit } from '../_shared/supabaseAdmin.ts';
import { hashOtp, safeEqual } from '../_shared/crypto.ts';
import { normalizePhone, E164, identityEmailFor } from '../_shared/phone.ts';
import { logError, logWarn } from '../_shared/log.ts';
import { isDemoMode, DEMO_CODE } from '../_shared/demo.ts';

const FN = 'otp-verify';
const MAX_ATTEMPTS = 5;

serve(FN, async (req, res) => {
  const { phone, code } = await readJson<{ phone?: string; code?: string }>(req);
  if (!phone || !code) return res.error('missing_fields', 400);
  const normPhone = normalizePhone(phone);
  if (!E164.test(normPhone)) return res.error('invalid_phone', 400);

  const admin = adminClient(FN);

  // Latest UNUSED code for this phone (used codes are never candidates → no reuse).
  const { data: rows, error: selErr } = await admin
    .from('otp_codes')
    .select('id, code_hash, name, email, expires_at, attempts')
    .eq('phone', normPhone)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1);
  if (selErr) {
    logError(FN, 'select otp_codes', selErr);
    return res.error('server_error', 500);
  }
  const row = rows?.[0];
  if (!row) return res.error('invalid_code', 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return res.error('invalid_code', 400);
  if (row.attempts >= MAX_ATTEMPTS) return res.error('too_many_attempts', 429);

  // Real verification always runs: the row must exist and be unused, and the
  // checks above (expiry, attempt cap) have already applied. DEMO_MODE relaxes
  // ONLY this final comparison, by additionally accepting a fixed code.
  const candidate = await hashOtp(String(code), normPhone, FN);
  const realMatch = safeEqual(candidate, row.code_hash);
  const demoMatch = !realMatch && isDemoMode() && String(code) === DEMO_CODE;

  if (!realMatch && !demoMatch) {
    const { error: attErr } = await admin.from('otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    if (attErr) logError(FN, 'update otp_codes.attempts', attErr);
    return res.error('invalid_code', 400);
  }
  if (demoMatch) {
    // Visible in the logs every time the bypass is used. No phone/code logged.
    logWarn(FN, 'demo_bypass', 'DEMO_MODE=true accepted the fixed demo code — verification relaxed');
  }

  // Correct — burn it (single use) BEFORE minting the session.
  const { error: usedErr } = await admin.from('otp_codes').update({ used: true }).eq('id', row.id);
  if (usedErr) {
    logError(FN, 'update otp_codes.used', usedErr);
    return res.error('server_error', 500);
  }

  // 1) Ensure the auth user exists (returning users hit "already registered").
  const identityEmail = identityEmailFor(normPhone);
  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: identityEmail,
    phone: normPhone,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { name: row.name, contact_email: row.email },
  });
  if (createErr) {
    if (!/already|exists|registered/i.test(createErr.message)) {
      logError(FN, 'auth.admin.createUser', createErr);
      return res.error('server_error', 500);
    }
    // returning user → login path
  } else {
    userId = created.user?.id ?? null;
  }

  // 2) Mint a session: admin magic-link token → redeem on anon client.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: identityEmail,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    logError(FN, 'auth.admin.generateLink', linkErr ?? new Error('no hashed_token in response'));
    return res.error('server_error', 500);
  }
  userId = userId ?? link.user?.id ?? null;

  const { data: verified, error: verErr } = await anonClient(FN).auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verErr || !session) {
    logError(FN, 'auth.verifyOtp(magiclink token_hash)', verErr ?? new Error('no session returned'));
    return res.error('server_error', 500);
  }
  userId = userId ?? session.user.id;

  // 3) Profile row with the registration details (the auth trigger creates a
  //    bare row; this fills name/phone/real email). Non-fatal but logged.
  const { error: profErr } = await admin.from('profiles').upsert({
    id: userId,
    name: row.name,
    phone: normPhone,
    email: row.email,
  });
  if (profErr) logError(FN, 'upsert profiles', profErr);

  await writeAudit(admin, FN, userId, 'otp_verified', 'profiles', userId ?? undefined);

  return res.json({ access_token: session.access_token, refresh_token: session.refresh_token });
});
