// export-my-data: PDPA data-subject access — everything we hold about the
// caller as JSON, sensitive fields decrypted for their own copy.
import { serve } from '../_shared/serve.ts';
import { adminClient, getUserId, writeAudit } from '../_shared/supabaseAdmin.ts';
import { decryptField } from '../_shared/crypto.ts';
import { logError } from '../_shared/log.ts';

const FN = 'export-my-data';

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const admin = adminClient(FN);
  const [profile, surveys, claims, appts, consents] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
    admin.from('survey_responses').select('*').eq('user_id', userId),
    admin.from('kit_claims').select('id, hospital_id, machine_id, status, created_at, released_at').eq('user_id', userId),
    admin.from('appointments').select('*').eq('user_id', userId),
    admin.from('consents').select('*').eq('user_id', userId).order('created_at'),
  ]);
  for (const [step, r] of [
    ['select profiles', profile],
    ['select survey_responses', surveys],
    ['select kit_claims', claims],
    ['select appointments', appts],
    ['select consents', consents],
  ] as const) {
    if (r.error) {
      logError(FN, step, r.error);
      return res.error('server_error', 500);
    }
  }

  const survey_responses = [];
  for (const s of surveys.data ?? []) {
    survey_responses.push({
      ...s,
      q3_department: await decryptField(s.q3_department, FN),
      q4_need: await decryptField(s.q4_need, FN),
      q4_other_text: await decryptField(s.q4_other_text, FN),
    });
  }
  const appointments = [];
  for (const a of appts.data ?? []) {
    appointments.push({
      ...a,
      clinic_name: await decryptField(a.clinic_name, FN),
      reference_no: await decryptField(a.reference_no, FN),
      raw_ocr_text: await decryptField(a.raw_ocr_text, FN),
    });
  }

  await writeAudit(admin, FN, userId, 'data_exported', 'profiles', userId);

  return res.json({
    exported_at: new Date().toISOString(),
    profile: profile.data,
    consents: consents.data ?? [],
    survey_responses,
    kit_claims: claims.data ?? [],
    appointments,
  });
});
