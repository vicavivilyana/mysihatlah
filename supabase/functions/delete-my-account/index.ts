// delete-my-account: PDPA right to erasure. Removes appointment images from
// the private bucket, writes an audit entry (actor id only, no PII), clears
// the user's rows, then deletes the auth user (which also cascades).
import { serve } from '../_shared/serve.ts';
import { adminClient, getUserId, writeAudit } from '../_shared/supabaseAdmin.ts';
import { logError } from '../_shared/log.ts';

const FN = 'delete-my-account';
const BUCKET = 'appointment-cards';

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const admin = adminClient(FN);

  // 1) Storage objects are NOT cascaded by the FK — remove them explicitly.
  const { data: objects, error: listErr } = await admin.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (listErr) {
    logError(FN, 'storage.list', listErr);
    return res.error('server_error', 500);
  }
  if (objects && objects.length) {
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(objects.map((o) => `${userId}/${o.name}`));
    if (rmErr) {
      logError(FN, 'storage.remove', rmErr);
      return res.error('server_error', 500);
    }
  }

  // 2) Audit BEFORE deletion (kept for compliance; carries no PII).
  await writeAudit(admin, FN, userId, 'account_deleted', 'profiles', userId, { images_removed: objects?.length ?? 0 });

  // 3) Explicit row deletes (defense in depth; FK cascade also covers these).
  for (const [table, col] of [
    ['appointments', 'user_id'],
    ['survey_responses', 'user_id'],
    ['kit_claims', 'user_id'],
    ['consents', 'user_id'],
    ['profiles', 'id'],
  ] as const) {
    const { error } = await admin.from(table).delete().eq(col, userId);
    if (error) {
      logError(FN, `delete ${table}`, error);
      return res.error('server_error', 500);
    }
  }

  // 4) Auth user.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    logError(FN, 'auth.admin.deleteUser', delErr);
    return res.error('server_error', 500);
  }

  return res.json({ ok: true });
});
