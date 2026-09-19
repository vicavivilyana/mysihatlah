// Fail-loud environment access for Edge Functions.
// Every required variable is read through requireEnv so a missing value
// produces ONE clear console.error naming the variable and how to set it,
// instead of a vague failure deep inside a request.

export function requireEnv(name: string, fn = 'env'): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    console.error(
      `[${fn}] Missing required environment variable ${name}. ` +
        `Local: add it to supabase/functions/.env (npm run setup:local writes it). ` +
        `Hosted: supabase secrets set ${name}=...`,
    );
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

/**
 * The Supabase origin the BROWSER can reach. Inside the local Docker network the
 * functions see SUPABASE_URL=http://kong:8000, which is unreachable from a
 * browser; PUBLIC_SUPABASE_URL (set by `npm run setup:local`) overrides it so
 * signed storage URLs work locally. On hosted the two are identical.
 */
export function publicSupabaseUrl(fn = 'env'): string {
  return optionalEnv('PUBLIC_SUPABASE_URL') ?? requireEnv('SUPABASE_URL', fn);
}

/** Rewrite an internal Supabase URL (e.g. a signed URL) to the public origin. */
export function toPublicUrl(url: string, fn = 'env'): string {
  const internal = requireEnv('SUPABASE_URL', fn).replace(/\/+$/, '');
  const pub = publicSupabaseUrl(fn).replace(/\/+$/, '');
  if (internal === pub) return url;
  return url.startsWith(internal) ? pub + url.slice(internal.length) : url;
}
