// admin-export-surveys: CSV (Excel-openable) of survey responses for admins.
//
// ===================== ACCESS CONTROL — WHY THIS DESIGN ====================
// Two options were considered:
//   (a) an admin-only RLS path, i.e. give some authenticated role SELECT over
//       every row of survey_responses; or
//   (b) a server-only Edge Function gated by a shared secret (this file).
//
// (b) is the safer choice and is what is implemented. Under (a) the survey
// table would have to become readable by a client-facing role, so a single
// policy mistake, a leaked admin login, or an XSS in the app would expose
// every visitor's health answers. Under (b) the anon/authenticated client
// keeps its current RLS posture — a user can read ONLY their own rows, and
// there is no client-reachable path to anyone else's survey data at all. The
// export runs with the service role inside the function, authenticated by
// ADMIN_EXPORT_SECRET, which never ships in the browser bundle.
//
// verify_jwt = false because an admin is not a Supabase end-user; the secret
// header is the credential, compared in constant time.
//
// PDPA: this is sensitive health data. Every export is written to audit_log
// with the caller's label, timestamp and row count.
// ==========================================================================
//
// WHAT THE CSV INCLUDES (deliberate):
//   survey_id, created_at, scanned_at, hospital_id, machine_id,
//   q1_for_whom, q2_age, q3_department*, q4_need*, q4_other_text*,
//   consent_terms_privacy, consent_marketing, claim_status, kit_dispensed_at
//   (* decrypted — these ARE the survey answers and are the point of the export)
//
// WHAT IT DELIBERATELY EXCLUDES:
//   user_id, name, phone, email, appointment data, release tokens, deposits.
//   Rows are pseudonymous: there is no key in the file that links a row back
//   to a person without separate database access.
import { serve } from '../_shared/serve.ts';
import { adminClient, writeAudit } from '../_shared/supabaseAdmin.ts';
import { decryptField, safeEqual } from '../_shared/crypto.ts';
import { requireEnv } from '../_shared/env.ts';
import { corsFor } from '../_shared/cors.ts';
import { logError } from '../_shared/log.ts';

const FN = 'admin-export-surveys';

const HEADERS = [
  'survey_id', 'created_at', 'scanned_at', 'hospital_id', 'machine_id',
  'q1_for_whom', 'q2_age', 'q3_department', 'q4_need', 'q4_other_text',
  'consent_terms_privacy', 'consent_marketing', 'claim_status', 'kit_dispensed_at',
];

/** RFC4180 escaping; prefix formula characters so Excel can't execute them. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

serve(FN, async (req, res) => {
  const secret = requireEnv('ADMIN_EXPORT_SECRET', FN);
  const provided = req.headers.get('x-admin-secret') ?? '';
  if (!safeEqual(provided, secret)) return res.error('unauthorized', 401);

  const admin = adminClient(FN);

  const [surveys, claims, consents] = await Promise.all([
    admin.from('survey_responses').select('*').order('created_at'),
    admin.from('kit_claims').select('user_id, status, released_at'),
    admin.from('consents').select('user_id, purpose, granted, created_at').order('created_at'),
  ]);
  for (const [step, r] of [['survey_responses', surveys], ['kit_claims', claims], ['consents', consents]] as const) {
    if (r.error) {
      logError(FN, `select ${step}`, r.error);
      return res.error('server_error', 500);
    }
  }

  const claimByUser = new Map<string, { status: string; released_at: string | null }>();
  for (const c of claims.data ?? []) claimByUser.set(c.user_id, { status: c.status, released_at: c.released_at });

  // Latest consent decision per (user, purpose).
  const consentByUser = new Map<string, { terms: boolean; marketing: boolean }>();
  for (const c of consents.data ?? []) {
    const cur = consentByUser.get(c.user_id) ?? { terms: false, marketing: false };
    if (c.purpose === 'terms_privacy') cur.terms = c.granted;
    if (c.purpose === 'marketing') cur.marketing = c.granted;
    consentByUser.set(c.user_id, cur);
  }

  const lines = [HEADERS.join(',')];
  for (const s of surveys.data ?? []) {
    const claim = claimByUser.get(s.user_id);
    const consent = consentByUser.get(s.user_id) ?? { terms: false, marketing: false };
    lines.push([
      s.id, s.created_at, s.scanned_at, s.hospital_id, s.machine_id,
      s.q1_for_whom, s.q2_age,
      await decryptField(s.q3_department, FN),
      await decryptField(s.q4_need, FN),
      await decryptField(s.q4_other_text, FN),
      consent.terms, consent.marketing,
      claim?.status ?? '', claim?.released_at ?? '',
    ].map(csvCell).join(','));
  }

  const rowCount = lines.length - 1;
  await writeAudit(admin, FN, null, 'admin_survey_export', 'survey_responses', undefined, {
    row_count: rowCount,
    label: req.headers.get('x-admin-label') ?? 'unlabelled',
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      ...corsFor(req, FN),
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mysihatlah-surveys-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
