// list-appointments: the caller's appointments, decrypted server-side, with
// fresh signed URLs for the private card images.
import { serve } from '../_shared/serve.ts';
import { adminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { decryptField } from '../_shared/crypto.ts';
import { toPublicUrl } from '../_shared/env.ts';
import { logError } from '../_shared/log.ts';

const FN = 'list-appointments';
const BUCKET = 'appointment-cards';
const SIGNED_URL_TTL = 3600;

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const admin = adminClient(FN);
  const { data, error } = await admin
    .from('appointments')
    .select('id, clinic_name, followup_at, pickup_at, reference_no, image_path, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    logError(FN, 'select appointments', error);
    return res.error('server_error', 500);
  }

  const appointments = [];
  for (const a of data ?? []) {
    let image_url: string | null = null;
    if (a.image_path) {
      const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(a.image_path, SIGNED_URL_TTL);
      if (signErr) logError(FN, `storage.createSignedUrl ${a.id}`, signErr);
      image_url = signed?.signedUrl ? toPublicUrl(signed.signedUrl, FN) : null;
    }
    appointments.push({
      id: a.id,
      clinic_name: (await decryptField(a.clinic_name, FN)) ?? '',
      followup_at: a.followup_at,
      pickup_at: a.pickup_at,
      reference_no: await decryptField(a.reference_no, FN),
      image_path: a.image_path,
      image_url,
      created_at: a.created_at,
    });
  }

  return res.json({ appointments });
});
