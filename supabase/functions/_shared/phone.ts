/** Normalise a Malaysian-first phone input to E.164 (+60…). */
export function normalizePhone(raw: string): string {
  const trimmed = String(raw).trim().replace(/[\s\-()]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return `+60${trimmed.slice(1)}`;
  if (trimmed.startsWith('60')) return `+${trimmed}`;
  return `+${trimmed}`;
}

export const E164 = /^\+[0-9]{8,15}$/;

/**
 * Deterministic auth identity for a phone-verified user. Supabase Auth needs an
 * email or phone login identity; we key it on the phone so a returning user
 * always maps to the same account regardless of the email they type. Their
 * real email is stored on `profiles`.
 */
export function identityEmailFor(phone: string): string {
  return `${phone.replace(/\D/g, '')}@phone.healthgo.local`;
}
