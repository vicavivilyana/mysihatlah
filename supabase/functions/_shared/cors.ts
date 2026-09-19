// CORS driven by ALLOWED_ORIGINS (comma-separated exact origins, e.g.
// "http://localhost:5173,https://healthgo.pages.dev"). The literal "*" is
// accepted for throwaway dev setups only. The matching origin is echoed back
// with Vary: Origin; a non-matching origin gets no Allow-Origin header, so the
// browser blocks it. Every response — success, error, catch — carries these
// headers via the Responder helpers below.
import { requireEnv } from './env.ts';

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-dispenser-secret, x-seed-secret';
const ALLOW_METHODS = 'POST, OPTIONS';

export type CorsHeaders = Record<string, string>;

export function corsFor(req: Request, fn: string): CorsHeaders {
  const allowed = requireEnv('ALLOWED_ORIGINS', fn)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const origin = (req.headers.get('origin') ?? '').replace(/\/+$/, '');

  const headers: CorsHeaders = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (allowed.includes('*')) headers['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export interface Responder {
  cors: CorsHeaders;
  preflight(): Response;
  json(body: unknown, status?: number): Response;
  /** Generic client-facing reason code; details go to the server log only. */
  error(reason: string, status?: number): Response;
}

export function responder(req: Request, fn: string): Responder {
  const cors = corsFor(req, fn);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  return {
    cors,
    preflight: () => new Response('ok', { status: 200, headers: cors }),
    json,
    error: (reason, status = 400) => json({ ok: false, error: reason, reason }, status),
  };
}
