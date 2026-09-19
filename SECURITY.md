# HealthGo — Security & PDPA Compliance

HealthGo handles **sensitive personal data** under Malaysia's Personal Data
Protection Act 2010 (as amended 2024–2025): health survey answers, department
visited, appointment data and card images, and phone numbers. Data protection is
a first-class requirement, not an afterthought.

## Data classification

| Data | Sensitivity | Protection |
|------|-------------|------------|
| Phone number, name, email | Personal | RLS; server-side only for OTP |
| Survey: department, biggest need | **Sensitive (health)** | AES-256-GCM field encryption |
| Appointment: clinic, reference, raw OCR text | **Sensitive (health)** | AES-256-GCM field encryption |
| Appointment card image | **Sensitive (health)** | Private bucket, signed URLs only |
| OTP codes | Secret | HMAC-SHA-256 hashed, never client-readable |
| Consents | Personal | RLS, append-only history |

## Controls

### Encryption
- **In transit:** TLS 1.2+ everywhere (Supabase + Cloudflare).
- **At rest:** Supabase-managed encryption for the database and storage.
- **Field-level:** AES-256-GCM inside Edge Functions for the sensitive fields
  above. Key = `FIELD_ENCRYPTION_KEY` (32 bytes, server env only). Ciphertext is
  stored as `gcm1.<iv>.<ciphertext>`; the key never reaches the client.

### Access control
- **Row Level Security on every user table**, DB-enforced. Users can only read
  (and, where allowed, delete) their own rows. Verified by
  `supabase/tests/rls_isolation_test.sql` (`supabase test db`).
- `otp_codes` and `audit_log` have RLS enabled with **no policies** → no client
  access at all; only the service role (Edge Functions) can touch them.
- Appointment images live in a **private** bucket; storage policies scope every
  object to the owner's `uid/` folder, and reads use short-lived signed URLs.
- Sensitive data is **never filtered client-side** — the server returns only the
  caller's rows.

### Secrets
- Service role key, `FIELD_ENCRYPTION_KEY`, `DISPENSER_SHARED_SECRET` and future
  SMS keys are **server-side only** (Supabase secrets / function env). None are
  `VITE_`-prefixed, so none can enter the client bundle. This is verifiable:
  ```bash
  npm run build
  grep -rE "SERVICE_ROLE|FIELD_ENCRYPTION_KEY|DISPENSER_SHARED_SECRET" dist/   # no matches
  ```
- The Google Maps key is a **public client key by design** — it is restricted by
  HTTP referrer and API, not obfuscated.

### OTP
- 6-digit codes, HMAC-SHA-256 hashed with a server-key pepper, 5-minute expiry,
  single-use, max 5 attempts, 30s resend cooldown + 5/hour rate limit. Issued and
  verified only in Edge Functions.

### One kit per user
- Enforced by a **database `UNIQUE(user_id)`** constraint on `kit_claims`, not app
  logic. Claim + stock decrement + survey + audit happen in a single Postgres
  transaction (`claim_welcome_kit`). Release tokens are one-time and expiring.

### Consent
- Mandatory Terms/Privacy acceptance and optional marketing opt-in are stored
  **separately** in `consents` as an append-only history; withdrawable in Profile.
  Health data collection requires explicit consent.

### Data-subject rights (PDPA)
- **Export my data** (`export-my-data`) returns all held data as JSON, decrypted
  for the user's own copy.
- **Delete my account & data** (`delete-my-account`) removes all PII including
  appointment images from storage, then deletes the auth user (cascading DB rows).

### Data minimization & retention
- Only data that is used is collected. `run_retention_cleanup()` (scheduled daily
  via `pg_cron`) expires OTPs and unredeemed release tokens and purges
  appointments beyond a configurable window (default 365 days).

### Audit
- Privileged functions write to `audit_log` (OTP requested/verified, kit claimed,
  kit released, appointment saved, data exported, account deleted, retention runs).
  Audit rows carry actor id + metadata, never sensitive plaintext.

## Breach readiness (PDPA 72-hour notification)

1. **Detect & contain** — revoke the affected key(s): rotate
   `SUPABASE_SERVICE_ROLE_KEY`, `FIELD_ENCRYPTION_KEY` (re-encrypt), and
   `DISPENSER_SHARED_SECRET` as applicable; disable affected functions.
2. **Assess** — use `audit_log` to scope what data and which users are affected.
3. **Notify within 72 hours** — report to the Personal Data Protection Department
   (JPDP) and affected data subjects, per the 2024–2025 breach-notification rules.
4. **Remediate & record** — patch the root cause and file an incident record.

**Data Protection Officer:** _[TODO: name, email, phone before go-live]_
**Security contact:** _[TODO: security@mekxtech… before go-live]_

## Third-party processors (line up DPAs)

- **Supabase** — database, auth, storage, functions hosting
- **Google** — Maps JavaScript API + Places
- **SMS gateway** (future) — OTP delivery
- **Cloudflare** — static hosting / CDN
