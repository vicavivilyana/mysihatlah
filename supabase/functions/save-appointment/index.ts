// save-appointment: encrypt sensitive fields, insert, return the saved record
// with a short-lived signed URL for the (private) card image.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, getUserId, writeAudit } from '../_shared/supabaseAdmin.ts';
import { encryptField } from '../_shared/crypto.ts';
import { toPublicUrl } from '../_shared/env.ts';
import { logError } from '../_shared/log.ts';

const FN = 'save-appointment';
const BUCKET = 'appointment-cards';
const SIGNED_URL_TTL = 3600;

interface Body {
  clinic_name?: string;
  followup_at?: string | null;
  pickup_at?: string | null;
  reference_no?: string | null;
  raw_ocr_text?: string | null;
  image_path?: string | null;
}

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const body = await readJson<Body>(req);
  if (!body.clinic_name || (!body.followup_at && !body.pickup_at)) return res.error('missing_fields', 400);

  // An uploaded image must live under the caller's own folder.
  const imagePath = body.image_path ?? null;
  if (imagePath && !imagePath.startsWith(`${userId}/`)) return res.error('forbidden_path', 403);

  const admin = adminClient(FN);
  const row = {
    user_id: userId,
    clinic_name: await encryptField(body.clinic_name, FN),
    followup_at: body.followup_at ?? null,
    pickup_at: body.pickup_at ?? null,
    reference_no: await encryptField(body.reference_no ?? null, FN),
    raw_ocr_text: await encryptField(body.raw_ocr_text ?? null, FN),
    image_path: imagePath,
  };

  const { data, error } = await admin.from('appointments').insert(row).select('id, followup_at, pickup_at, created_at').single();
  if (error) {
    logError(FN, 'insert appointments', error);
    return res.error('server_error', 500);
  }

  await writeAudit(admin, FN, userId, 'appointment_saved', 'appointments', data.id);

  let image_url: string | null = null;
  if (imagePath) {
    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(imagePath, SIGNED_URL_TTL);
    if (signErr) logError(FN, 'storage.createSignedUrl', signErr);
    image_url = signed?.signedUrl ? toPublicUrl(signed.signedUrl, FN) : null;
  }

  // Echo plaintext back — the caller just submitted these values.
  return res.json({
    id: data.id,
    clinic_name: body.clinic_name,
    followup_at: data.followup_at,
    pickup_at: data.pickup_at,
    reference_no: body.reference_no ?? null,
    image_path: imagePath,
    image_url,
    created_at: data.created_at,
  });
});
