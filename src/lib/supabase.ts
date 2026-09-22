import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Non-fatal: the app still renders so the UI can be demoed, but data calls
  // will fail gracefully. Run `npm run setup:local` to generate .env.local.
  console.warn(
    '[HealthGo] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Backend calls will fail until you configure .env.local (npm run setup:local).',
  );
}

/**
 * Public Supabase client. Uses the ANON key only — every table is protected by
 * Row Level Security, so this key is safe to ship in the browser bundle.
 * Privileged operations (OTP, kit claim, appointment save, data export/delete)
 * go through Edge Functions that use the service role server-side.
 */
export const supabase = createClient(url ?? 'http://127.0.0.1:54321', anonKey ?? 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'healthgo.auth',
  },
});

export const hasSupabaseConfig = Boolean(url && anonKey);

/**
 * Transport-level classification of an Edge Function failure:
 *  - `network`: the request never completed (function not deployed/served,
 *    wrong URL, backend down, CORS preflight blocked) — FunctionsFetchError.
 *  - `http`: the function ran and returned non-2xx; `reason` is the server's
 *    JSON reason code — FunctionsHttpError.
 *  - `relay`: the Supabase relay itself errored — FunctionsRelayError.
 *  - `unknown`: anything else.
 */
export type FunctionErrorCode = 'network' | 'http' | 'relay' | 'unknown';

export class FunctionError extends Error {
  code: FunctionErrorCode;
  /** Server-provided reason for `http` errors (e.g. "already_claimed"). */
  reason?: string;
  status?: number;
  constructor(message: string, code: FunctionErrorCode, reason?: string, status?: number) {
    super(message);
    this.name = 'FunctionError';
    this.code = code;
    this.reason = reason;
    this.status = status;
  }
}

/** Call a Supabase Edge Function with the current user's bearer token. */
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body ?? {} });

  if (error) {
    if (import.meta.env.DEV) console.error(`[HealthGo] Edge Function "${name}" failed:`, error);

    if (error instanceof FunctionsHttpError) {
      let reason = 'server_error';
      const status = error.context?.status;
      try {
        const j = (await error.context.json()) as { error?: string; reason?: string };
        reason = j.reason || j.error || reason;
      } catch {
        /* non-JSON body */
      }
      // A 401 means the JWT is no longer valid for a real user (expired, or
      // the account was deleted server-side). Drop the dead session so the app
      // can re-authenticate instead of showing "session expired" forever.
      if (status === 401 || reason === 'unauthorized') {
        void supabase.auth.signOut();
      }
      // message === reason so callers can match either.
      throw new FunctionError(reason, 'http', reason, status);
    }
    if (error instanceof FunctionsRelayError) throw new FunctionError(error.message, 'relay');
    if (error instanceof FunctionsFetchError) throw new FunctionError(error.message, 'network');
    throw new FunctionError(error.message, 'unknown');
  }

  return data as T;
}

/** Every reason code an Edge Function can return, each with an `errors.*` i18n key. */
export const KNOWN_REASONS = [
  'rate_limited',
  'invalid_phone',
  'invalid_code',
  'too_many_attempts',
  'missing_fields',
  'unauthorized',
  'terms_required',
  'invalid_machine',
  'out_of_stock',
  'already_claimed',
  'invalid_token',
  'expired',
  'already_used',
  'forbidden_path',
  'no_claim',
  'refund_failed',
  'not_dispensed',
  'no_deposit',
  'already_finalized',
  'payment_failed',
  'payment_required',
  'method_not_allowed',
  'server_error',
] as const;

/** Map a caught error to an i18n key for user-facing display. */
export function functionErrorKey(e: unknown): string {
  if (e instanceof FunctionError) {
    if (e.code === 'network') return 'errors.network';
    if (e.code === 'relay') return 'errors.relay';
    if (e.code === 'http' && e.reason && (KNOWN_REASONS as readonly string[]).includes(e.reason)) {
      return `errors.${e.reason}`;
    }
    return 'errors.server_error';
  }
  return 'common.error';
}

/** True when the error is an HTTP failure with the given reason code. */
export function isReason(e: unknown, reason: (typeof KNOWN_REASONS)[number]): boolean {
  return e instanceof FunctionError && e.code === 'http' && e.reason === reason;
}
