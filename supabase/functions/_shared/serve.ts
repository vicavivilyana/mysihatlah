// Common request wrapper for every Edge Function:
//   * builds CORS headers (fails loudly if ALLOWED_ORIGINS is missing)
//   * answers OPTIONS preflight first
//   * rejects non-POST
//   * catches anything thrown, logs it as [fn] unhandled, returns a generic
//     500 that STILL carries CORS headers.
import { responder, type Responder } from './cors.ts';
import { logError } from './log.ts';

export type Handler = (req: Request, res: Responder) => Promise<Response>;

export function serve(fn: string, handler: Handler): void {
  Deno.serve(async (req: Request): Promise<Response> => {
    let res: Responder;
    try {
      res = responder(req, fn);
    } catch (e) {
      // Misconfiguration (e.g. ALLOWED_ORIGINS unset). requireEnv already
      // logged the exact variable; respond without CORS so it's visibly broken.
      logError(fn, 'init', e);
      return new Response(JSON.stringify({ ok: false, error: 'server_error', reason: 'server_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'OPTIONS') return res.preflight();
    if (req.method !== 'POST') return res.error('method_not_allowed', 405);

    try {
      return await handler(req, res);
    } catch (e) {
      logError(fn, 'unhandled', e);
      return res.error('server_error', 500);
    }
  });
}

/** Parse a JSON body, returning {} (never throwing) on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
