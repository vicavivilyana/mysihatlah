# HealthGo

A mobile-first health app for Malaysian hospitals. Runs as an installable **PWA**
for the pilot and is architected to be wrapped with **Capacitor** and shipped to
the App Store / Google Play with no rewrite (`com.mekxtech.healthgo`).
Bilingual throughout (English + 简体中文).

## Feature status

| # | Feature | Status |
|---|---------|--------|
| 1 | Free welcome kit — 5-question survey → atomic one-per-user claim → app shows a one-time QR the machine scans | **LIVE** |
| 2 | Appointment reminders — photo → OCR → editable review → local notifications + `.ics` | **LIVE** |
| 3 | Nearby food & deals — Google Map centred on the user | **LIVE** |
| 4–8 | Hospital guide · Rewards · Free Check (AIA) · E-store · Parking map | Scaffolded ("Coming soon", no fake integrations) |

## Stack

React + Vite + TypeScript + Tailwind (PWA, `react-i18next`) · Supabase (Postgres,
Auth, Edge Functions, RLS, Storage) · `tesseract.js` OCR · `qrcode.react` QR
generation · `@vis.gl/react-google-maps` · Cloudflare Pages.

**Security model in one line:** the browser holds only the anon key + a
restricted Maps key; everything privileged runs in Edge Functions with the
service role, every table has RLS **and** explicit grants, sensitive fields are
AES-256-GCM encrypted, images are in a private bucket. See [SECURITY.md](SECURITY.md).

---

## Local development (start here)

You need **Node 20+** and **Docker Desktop** (running). Everything else is an
`npm` script — you never have to type `supabase` or `docker` yourself.

```bash
# 0. install
npm install

# 1. start the local Supabase stack (Postgres, Auth, Storage, Studio) — ~1 min first time
npm run sb:start

# 2. generate local secrets + client env (safe to re-run; keeps existing secrets)
npm run setup:local

# 3. create the database from the migrations + demo data (HG-TEST-000 dispenser)
npm run sb:reset

# 4. serve the Edge Functions  ← keep this terminal open
npm run sb:functions
```

Open a **second terminal**:

```bash
npm run dev          # http://localhost:5173
```

Register with any name/email/phone. The OTP screen shows **"Dev mode: code is
123456"** (the mock SMS provider) — enter it and you land on Home. Claiming the
kit needs no hardware: answer the survey and the app displays the QR a machine
would scan (stock comes from the seeded `HG-TEST-000` dispenser).

### Prove it works

```bash
npm run smoke        # full API path: OTP → claim → release → appointments → RLS → export → delete
npm run sb:test      # database tests: RLS isolation, privileges, claim transaction
```

### Everyday commands

| Command | What it does |
|---|---|
| `npm run sb:start` / `sb:stop` | Start / stop the local Supabase stack |
| `npm run setup:local [-- --force]` | Write `supabase/functions/.env` + `.env.local` (`--force` regenerates secrets) |
| `npm run sb:reset` | Rebuild the local DB from `supabase/migrations` + `seed.sql` |
| `npm run sb:functions` | Serve Edge Functions locally (auto-loads `supabase/functions/.env`) |
| `npm run sb:test` | Run the pgTAP suite in `supabase/tests` |
| `npm run smoke` | End-to-end API smoke test against local |
| `npm run dev` / `build` | Vite dev server / production build to `dist/` |

If something fails, the function logs in the `sb:functions` terminal say
exactly which step and, for config problems, which variable is missing
(`[otp-request] Missing required environment variable OTP_PEPPER…`).

### Studio (optional)

`npm run sb:start` prints a Studio URL (http://127.0.0.1:54323) for browsing
tables. Don't fix things there — anything you change by hand disappears on the
next `sb:reset`; put it in a migration instead.

---

## Deploy to staging (hosted Supabase + Cloudflare Pages)

**1. Link the hosted project and push the schema** (creates tables, RLS,
grants, the private bucket + policies, extensions and the cleanup schedule —
no Studio clicks needed):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**2. Set the function secrets** (generate fresh values; never reuse local ones):

```bash
npx supabase secrets set \
  FIELD_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  OTP_PEPPER="$(openssl rand -base64 32)" \
  DISPENSER_SHARED_SECRET="$(openssl rand -hex 32)" \
  SEED_SECRET="$(openssl rand -hex 32)" \
  ALLOWED_ORIGINS="https://<your-app>.pages.dev,https://<custom-domain>" \
  POLICY_VERSION=2025-01 \
  OTP_PROVIDER=mock
```

Keep a copy of `DISPENSER_SHARED_SECRET` (for the hardware team) and
`SEED_SECRET` (for the next step) somewhere safe.

**3. Deploy the functions** (`config.toml` carries the per-function
`verify_jwt` settings):

```bash
npx supabase functions deploy
```

**4. Seed the demo hospital/machines** (idempotent; safe to re-run):

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/seed-demo" \
  -H "x-seed-secret: <SEED_SECRET>"
```

**5. Cloudflare Pages** — connect the repo, build command `npm run build`,
output directory `dist`, and set these environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` key |
| `VITE_GOOGLE_MAPS_API_KEY` | your restricted browser key |
| `VITE_GOOGLE_MAPS_MAP_ID` | optional |
| `VITE_POLICY_VERSION` | `2025-01` (must equal `POLICY_VERSION`) |

**6. Google Maps key restrictions** — Application restriction: *HTTP referrers*
= `https://<your-app>.pages.dev/*` (+ `http://localhost:5173/*` for dev).
API restrictions: *Maps JavaScript API* and *Places API* only.

**7. Check** — open the Pages URL, register (mock OTP shows the code), claim
with `HG-TEST-000`. Function logs: Supabase Dashboard → Edge Functions → Logs.

### Demo mode for staging

To show the app on staging before an SMS provider is wired up, set the
**server-side** `DEMO_MODE` flag:

```bash
npx supabase secrets set DEMO_MODE=true        # staging only
```

With it on, `otp-verify` also accepts the fixed code **`000000`**. Everything
else is unchanged: you still call otp-request first, and expiry, the 5-attempt
cap, rate limiting, HMAC hashing and session/profile creation all run exactly as
in production — only the final code comparison is relaxed. The app shows a
permanent **DEMO** badge (the client reads this from the `app-config` function,
so it reflects the backend, not the build).

> **Security caveat:** with `DEMO_MODE=true` anyone can register and sign in as
> **any phone number**. Use it only on a throwaway staging project with no real
> data, and set it back to `false` (`npx supabase secrets set DEMO_MODE=false`)
> before any real user touches the app. It is `false` by default and is never a
> `VITE_` variable, so it can't be switched on from the client.

### Going live later
Set `OTP_PROVIDER=twilio` + `TWILIO_*` secrets (real SMS; per-message cost),
replace the mock in `ALLOWED_ORIGINS` with only production domains, host the
final Privacy Policy and name a DPO (see [SECURITY.md](SECURITY.md)).

---

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| client | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase endpoint + public anon key |
| client | `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` | Restricted Maps key |
| client | `VITE_POLICY_VERSION` | Consent policy version (= `POLICY_VERSION`) |
| client | `VITE_QR_PAYLOAD_MODE` | Format of the kit QR: `json` (default), `token`, or `url` |
| client | `VITE_QR_URL_BASE` | Base URL for `url` mode (defaults to the app origin) |
| client | `VITE_DEFAULT_MACHINE_ID` | Dispenser a claim draws stock from (default `HG-TEST-000`) |
| functions | `FIELD_ENCRYPTION_KEY` | AES-256-GCM key (32 bytes base64) |
| functions | `OTP_PEPPER` | HMAC pepper for OTP hashes |
| functions | `DISPENSER_SHARED_SECRET` | `x-dispenser-secret` for the hardware |
| functions | `SEED_SECRET` | `x-seed-secret` for `seed-demo` |
| functions | `ALLOWED_ORIGINS` | CORS allow-list (comma-separated) |
| functions | `POLICY_VERSION` | Stamped on consent rows |
| functions | `OTP_PROVIDER` (+ `TWILIO_*`) | `mock` or `twilio` |
| functions | `DEMO_MODE` | `true` also accepts OTP `000000` (staging demos). Default `false` |
| functions | `PUBLIC_SUPABASE_URL` (optional) | Public origin for signed URLs (local only) |

Templates: [.env.example](.env.example) (client), [supabase/.env.example](supabase/.env.example) (functions).
Auto-injected into functions by Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Welcome-kit release: the phone shows the QR

The phone does **not** scan anything. After a successful claim the app renders
the one-time release token as a QR, and the vending machine's own scanner reads
it to dispense the kit.

```
survey → claim-kit → app displays QR → machine scans it
                                     → machine POSTs dispenser-release
                                     → app's QR screen flips to "Kit dispensed"
```

**QR payload format** is a single config flag, `VITE_QR_PAYLOAD_MODE`, so if the
installed machine needs a particular shape you change a setting and redeploy —
you do not rewrite code. All three modes carry the same token:

| Mode | Payload |
|---|---|
| `json` (default) | `{"v":1,"token":"…","hospital_id":"…","machine_id":"…","issued_at":"…"}` |
| `token` | the bare release token |
| `url` | `<VITE_QR_URL_BASE>/r/<token>` |

It is built in one place: [`src/features/kit/qrPayload.ts`](src/features/kit/qrPayload.ts).

**Redemption contract** (unchanged — this is what makes the token single-use):

```
POST /functions/v1/dispenser-release
Header: x-dispenser-secret: <DISPENSER_SHARED_SECRET>
Body:   { "release_token": "<token from the QR>" }

200 -> { "ok": true }                                             drop the kit
400 -> { "ok": false, "reason": "invalid_token"|"expired"|"already_used" }
401 -> { "ok": false, "reason": "unauthorized" }
```

Redemption is one guarded `UPDATE … WHERE status='pending' AND token_expires_at
> now() RETURNING`, so two scans of the same QR can never both dispense. Every
release writes `audit_log`.

**Expired code.** Tokens last ~5 minutes. If one lapses the screen offers
*Generate new code*, which mints a fresh token on the **same** claim
(`reissue_release_token`). It never moves stock and never creates a second
claim, so a user can still only ever receive one kit; once the kit is actually
released it returns `already_claimed`.

**Live status.** While the QR is shown the app polls its own `kit_claims` row
(RLS-scoped, so it only ever sees its own), and switches to "Kit dispensed 🎉"
as soon as the machine's redemption lands.

**No vendor dispense API.** Nothing in this build calls a machine vendor, and
nothing fakes one — the machine dispenses by reading our QR. A documented,
deliberately unimplemented seam lives at
[`supabase/functions/_shared/dispense/MachineDispenseProvider.ts`](supabase/functions/_shared/dispense/MachineDispenseProvider.ts)
for the day a vendor API exists.

## Going native / to the stores

The app is structured so wrapping is additive: `npx cap init HealthGo
com.mekxtech.healthgo --web-dir=dist`, add `@capacitor/camera`,
`@capacitor/local-notifications`, `@capacitor/geolocation` and a calendar
plugin, then swap implementations behind the existing interfaces
(`src/lib/notifications.ts`, `src/lib/ics.ts`, `OcrProvider`, `OtpProvider`).
Apple needs a Developer Program account (an organisation needs a **D-U-N-S**
number) and a hosted Privacy Policy URL; Google Play needs the Data Safety form.
Health data means a stricter review on both.

## Repo layout

```
src/                  React app (i18n/, lib/, providers/, store/, features/, components/, screens/)
supabase/migrations/  schema, RLS, explicit grants, atomic claim, retention (db push-safe)
supabase/functions/   Edge Functions (Deno) + _shared/ (env, cors, serve, crypto, log, otp/)
supabase/tests/       pgTAP suite (npm run sb:test)
supabase/seed.sql     local demo data (hosted uses the seed-demo function)
scripts/              setup-local.mjs, smoke.sh
```
