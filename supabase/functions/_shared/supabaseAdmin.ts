import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { requireEnv } from './env.ts';
import { logError } from './log.ts';

/**
 * Service-role client — bypasses RLS (but NOT table privileges; see migration
 * 0003). NEVER expose this key to the browser. Supabase injects SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY into every function.
 */
export function adminClient(fn: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL', fn), requireEnv('SUPABASE_SERVICE_ROLE_KEY', fn), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon-key client used to mint/verify user sessions. */
export function anonClient(fn: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL', fn), requireEnv('SUPABASE_ANON_KEY', fn), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Resolve the calling user's id by validating the Authorization bearer JWT
 * against Auth (not just by decoding it). Used by every user-facing function
 * in addition to the gateway's verify_jwt.
 */
export async function getUserId(req: Request, fn: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const client = createClient(requireEnv('SUPABASE_URL', fn), requireEnv('SUPABASE_ANON_KEY', fn), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    if (error) logError(fn, 'auth.getUser', error);
    return null;
  }
  return data.user.id;
}

export async function writeAudit(
  admin: SupabaseClient,
  fn: string,
  actorId: string | null,
  action: string,
  targetTable?: string,
  targetId?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('audit_log').insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    meta: meta ?? {},
  });
  // Audit failures must never break the user flow, but they must be visible.
  if (error) logError(fn, `audit ${action}`, error);
}
