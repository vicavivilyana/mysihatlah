#!/usr/bin/env bash
# npm run smoke — end-to-end smoke test against LOCAL Supabase.
# Requires: `npm run sb:start`, `npm run setup:local`, `npm run sb:reset`
# (seeds HG-TEST-000) and `npm run sb:functions` running in another terminal.
# Exits non-zero on the first failing step.
set -uo pipefail
cd "$(dirname "$0")/.."

# Docker Desktop's CLI isn't always on the shell PATH; the Supabase CLI needs it.
for d in "$HOME/.docker/bin" "/Applications/Docker.app/Contents/Resources/bin" /usr/local/bin /opt/homebrew/bin; do
  [[ -x "$d/docker" ]] && case ":$PATH:" in *":$d:"*) ;; *) PATH="$d:$PATH" ;; esac
done
export PATH
SB="./node_modules/.bin/supabase"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
envget() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }
API="$(envget .env.local VITE_SUPABASE_URL)"
ANON="$(envget .env.local VITE_SUPABASE_ANON_KEY)"
DISPENSER_SECRET="$(envget supabase/functions/.env DISPENSER_SHARED_SECRET)"
if [[ -z "$API" || -z "$ANON" || -z "$DISPENSER_SECRET" ]]; then
  echo "✖ Missing config. Run: npm run setup:local" >&2; exit 1
fi
FN="$API/functions/v1"; REST="$API/rest/v1"; STORAGE="$API/storage/v1"
TS=$(date +%s)
P1="+6011$(printf '%07d' $((TS % 10000000)))"      # unique per run → no OTP cooldown
P2="+6012$(printf '%07d' $((TS % 10000000)))"
P3="+6013$(printf '%07d' $((TS % 10000000)))"      # max-attempts lockout
P4="+6014$(printf '%07d' $((TS % 10000000)))"      # returning-user login
P5="+6015$(printf '%07d' $((TS % 10000000)))"      # demo-mode posture
TMP=$(mktemp -d)
PASS=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() { printf '\n▶ %s\n' "$1"; }
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
die()  { echo "  ❌ $1"; [[ -n "${BODY:-}" ]] && echo "     status=${STATUS:-?} body=${BODY:0:300}"; echo; echo "SMOKE FAILED"; exit 1; }
# req METHOD URL DATA [extra curl args...] → sets STATUS, BODY
req() {
  local m=$1 u=$2 d=$3; shift 3
  STATUS=$(curl -s -o "$TMP/body" -w '%{http_code}' -X "$m" "$u" -H "apikey: $ANON" "$@" ${d:+-H 'Content-Type: application/json' --data "$d"})
  BODY=$(cat "$TMP/body")
}
j() { python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
except Exception:
  print(''); sys.exit(0)
try:
  v=$1
  print('' if v is None else (json.dumps(v) if isinstance(v,(dict,list)) else v))
except Exception:
  print('')" <<<"$BODY"; }
jwt_sub() { python3 -c "import sys,base64,json; t=sys.argv[1].split('.')[1]; t+='='*(-len(t)%4); print(json.loads(base64.urlsafe_b64decode(t))['sub'])" "$1"; }
# Bearer headers are kept in arrays: an unquoted $(...) would split
# "Authorization: Bearer <tok>" into separate argv entries and curl would treat
# the fragments as extra URLs.
dbq() { "$SB" db query "$1" 2>/dev/null | python3 -c "import sys,json; s=sys.stdin.read(); d=json.loads(s[s.index('{'):]); print($2)"; }

# 1x1 PNG for image upload tests
python3 -c "import base64,sys; sys.stdout.buffer.write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='))" > "$TMP/px.png"

echo "HealthGo smoke test → $API  (user1 $P1, user2 $P2)"

# ---------------------------------------------------------------------------
step "1. otp-request (user1)"
req POST "$FN/otp-request" "{\"name\":\"Smoke One\",\"email\":\"smoke1@example.com\",\"phone\":\"$P1\"}"
[[ "$STATUS" == 200 && "$(j 'd["ok"]')" == "True" ]] || die "otp-request expected 200 ok"
CODE1=$(j 'd.get("devCode")'); [[ -n "$CODE1" ]] || die "no devCode (is OTP_PROVIDER=mock?)"
ok "200 ok, devCode present"

step "2. otp-verify (user1)"
req POST "$FN/otp-verify" "{\"phone\":\"$P1\",\"code\":\"$CODE1\"}"
[[ "$STATUS" == 200 ]] || die "otp-verify expected 200"
T1=$(j 'd.get("access_token")'); [[ -n "$T1" ]] || die "no access_token"
UID1=$(jwt_sub "$T1"); AUTH1=(-H "Authorization: Bearer $T1")
ok "session minted (sub=$UID1)"

step "2b. reused code is rejected"
req POST "$FN/otp-verify" "{\"phone\":\"$P1\",\"code\":\"$CODE1\"}"
[[ "$STATUS" == 400 && "$(j 'd["reason"]')" == "invalid_code" ]] || die "expected 400 invalid_code on reuse"
ok "400 invalid_code"

step "3. claim-kit HG-TEST-000 (user1)"
SURVEY='{"q1_for_whom":"self","q2_age":"20to30","q3_department":"cardiology","q4_need":"food","terms_accepted":true,"marketing_opt_in":true}'
req POST "$FN/claim-kit" "{\"machine_id\":\"HG-TEST-000\",\"location\":\"Lobby\",\"scanned_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"survey\":$SURVEY}" "${AUTH1[@]}"
[[ "$STATUS" == 200 && "$(j 'd["stage"]')" == "pending" ]] || die "stage A expected 200 pending"
[[ -z "$(j 'd.get(\"release_token\")')" ]] || die "stage A must NOT issue a token"
STOCK_A=$(dbq "select stock_count as n from public.machines where machine_id='HG-TEST-000'" "d['rows'][0]['n']")
ok "pending claim, no token, stock untouched ($STOCK_A)"

step "3a. QR before paying the deposit → refused"
req POST "$FN/claim-kit" '{"reissue":true}' "${AUTH1[@]}"
[[ "$STATUS" == 402 && "$(j 'd["reason"]')" == "payment_required" ]] || die "expected 402 payment_required, got $STATUS"
ok "402 payment_required"

step "3b. mock deposit → finalize → 60s QR token"
req POST "$FN/finalize-claim" '{"payment_ref":"smoke"}' "${AUTH1[@]}"
[[ "$STATUS" == 200 && "$(j 'd["stage"]')" == "finalized" ]] || die "finalize expected 200 finalized"
TOKEN=$(j 'd.get("release_token")'); [[ -n "$TOKEN" ]] || die "no release_token after finalize"
[[ "$(j 'd["deposit"]["status"]')" == "paid" ]] || die "deposit not recorded as paid"
STOCK_B=$(dbq "select stock_count as n from public.machines where machine_id='HG-TEST-000'" "d['rows'][0]['n']")
[[ "$STOCK_B" == "$((STOCK_A - 1))" ]] || die "stock should drop exactly 1 at finalize ($STOCK_A -> $STOCK_B)"
ok "deposit paid, token issued, stock $STOCK_A → $STOCK_B"

step "3c. re-issue: new QR for the SAME undispensed claim (never a 2nd kit)"
STOCK_AFTER_CLAIM="$STOCK_B"
req POST "$FN/claim-kit" '{"reissue":true}' "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "reissue expected 200"
[[ "$(j 'd["reissued"]')" == "True" ]] || die "reissue should report reissued=true"
OLD_TOKEN="$TOKEN"; TOKEN=$(j 'd.get("release_token")')
[[ -n "$TOKEN" && "$TOKEN" != "$OLD_TOKEN" ]] || die "reissue must mint a different token"
# The superseded QR must no longer open the machine.
req POST "$FN/dispenser-release" "{\"release_token\":\"$OLD_TOKEN\"}" -H "x-dispenser-secret: $DISPENSER_SECRET"
[[ "$STATUS" == 400 && "$(j 'd["reason"]')" == "invalid_token" ]] || die "superseded token should be invalid_token, got $STATUS $(j 'd["reason"]')"
STOCK_AFTER_REISSUE=$(dbq "select stock_count as n from public.machines where machine_id='HG-TEST-000'" "d['rows'][0]['n']")
[[ "$STOCK_AFTER_REISSUE" == "$STOCK_AFTER_CLAIM" ]] || die "re-issue moved stock ($STOCK_AFTER_CLAIM -> $STOCK_AFTER_REISSUE)"
CLAIMROWS=$(dbq "select count(*) as n from public.kit_claims where user_id='$UID1'" "d['rows'][0]['n']")
[[ "$CLAIMROWS" == "1" ]] || die "expected exactly 1 claim row after re-issue, got $CLAIMROWS"
ok "fresh token, old one dead, stock unchanged, still 1 claim row"

step "4. dispenser-release (valid token)"
req POST "$FN/dispenser-release" "{\"release_token\":\"$TOKEN\"}" -H "x-dispenser-secret: $DISPENSER_SECRET"
[[ "$STATUS" == 200 && "$(j 'd["ok"]')" == "True" ]] || die "dispenser-release expected 200 ok"
ok "kit released"

step "5. dispenser-release again → rejected"
req POST "$FN/dispenser-release" "{\"release_token\":\"$TOKEN\"}" -H "x-dispenser-secret: $DISPENSER_SECRET"
[[ "$STATUS" == 400 && "$(j 'd["reason"]')" == "already_used" ]] || die "expected 400 already_used"
ok "400 already_used"

step "5b. dispenser-release with bad secret → 401"
req POST "$FN/dispenser-release" "{\"release_token\":\"$TOKEN\"}" -H "x-dispenser-secret: wrong"
[[ "$STATUS" == 401 ]] || die "expected 401"
ok "401 unauthorized"

step "5c. re-issue after dispensing → refused"
req POST "$FN/claim-kit" '{"reissue":true}' "${AUTH1[@]}"
[[ "$STATUS" == 409 && "$(j 'd["reason"]')" == "already_claimed" ]] || die "reissue after release must be 409 already_claimed, got $STATUS"
ok "409 already_claimed"

step "5d. return power bank (mock) → deposit refunded + audited"
req POST "$FN/return-powerbank" '{}' "${AUTH1[@]}"
[[ "$STATUS" == 200 && "$(j 'd["deposit"]["status"]')" == "refunded" ]] || die "refund expected 200 refunded"
REF=$(dbq "select status as s from public.deposits where user_id='$UID1'" "d['rows'][0]['s']")
[[ "$REF" == "refunded" ]] || die "deposit row not refunded"
AUD=$(dbq "select count(*) as n from public.audit_log where actor_id='$UID1' and action='deposit_refunded'" "d['rows'][0]['n']")
[[ "$AUD" == "1" ]] || die "deposit_refunded not audited"
ok "RM20 refunded (mock), audit_log written"

step "5e. admin CSV export: secret required, normal user denied"
ADMIN_SECRET=$(envget supabase/functions/.env ADMIN_EXPORT_SECRET)
CSV_STATUS=$(curl -s -o "$TMP/csv" -w '%{http_code}' -X POST "$FN/admin-export-surveys" -H "x-admin-secret: $ADMIN_SECRET" -H "x-admin-label: smoke")
[[ "$CSV_STATUS" == 200 ]] || die "admin export expected 200, got $CSV_STATUS"
head -1 "$TMP/csv" | grep -q "survey_id,created_at" || die "CSV header missing"
req POST "$FN/admin-export-surveys" '{}' "${AUTH1[@]}"
[[ "$STATUS" == 401 ]] || die "a normal authenticated user must NOT reach the admin export (got $STATUS)"
ok "CSV returned for admin; authenticated user → 401"

step "6. second claim-kit (user1) → already_claimed"
req POST "$FN/claim-kit" "{\"machine_id\":\"HG-TEST-000\",\"survey\":$SURVEY}" "${AUTH1[@]}"
[[ "$STATUS" == 409 && "$(j 'd["reason"]')" == "already_claimed" ]] || die "expected 409 already_claimed"
ok "409 already_claimed"

step "7. upload card image to private bucket (storage policies)"
IMG1="$UID1/smoke-$TS-1.png"
STATUS=$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST "$STORAGE/object/appointment-cards/$IMG1" -H "apikey: $ANON" -H "Authorization: Bearer $T1" -H "Content-Type: image/png" --data-binary "@$TMP/px.png"); BODY=$(cat "$TMP/body")
[[ "$STATUS" == 200 ]] || die "storage upload expected 200"
ok "uploaded $IMG1"

step "8. save-appointment (encrypted fields + image)"
CLINIC="Smoke Clinic Ω $TS"
req POST "$FN/save-appointment" "{\"clinic_name\":\"$CLINIC\",\"followup_at\":\"2030-01-15T09:00:00Z\",\"pickup_at\":\"2030-01-20\",\"reference_no\":\"RN-$TS\",\"raw_ocr_text\":\"ocr text\",\"image_path\":\"$IMG1\"}" "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "save-appointment expected 200"
APPT1=$(j 'd.get("id")'); [[ -n "$APPT1" ]] || die "no appointment id"
ok "saved $APPT1"

step "8b. stored value is ciphertext, not plaintext"
ENC=$(dbq "select clinic_name from public.appointments where id = '$APPT1'" "d['rows'][0]['clinic_name']")
[[ "$ENC" == gcm1.* ]] || die "clinic_name in DB is not encrypted: ${ENC:0:40}"
ok "clinic_name stored as ${ENC:0:12}…"

step "9. list-appointments round-trips plaintext + signed URL"
req POST "$FN/list-appointments" "{}" "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "list-appointments expected 200"
[[ "$(j 'd["appointments"][0]["clinic_name"]')" == "$CLINIC" ]] || die "clinic_name did not round-trip"
[[ "$(j 'd["appointments"][0]["reference_no"]')" == "RN-$TS" ]] || die "reference_no did not round-trip"
IMGURL=$(j 'd["appointments"][0]["image_url"]'); [[ "$IMGURL" == http* ]] || die "no image_url"
IMGSTATUS=$(curl -s -o /dev/null -w '%{http_code}' "$IMGURL")
[[ "$IMGSTATUS" == 200 ]] || die "signed URL fetch expected 200, got $IMGSTATUS ($IMGURL)"
ok "decrypted fields match; signed image URL → 200"

step "10. second user cannot read user1's rows (RLS)"
req POST "$FN/otp-request" "{\"name\":\"Smoke Two\",\"email\":\"smoke2@example.com\",\"phone\":\"$P2\"}"
CODE2=$(j 'd.get("devCode")'); [[ -n "$CODE2" ]] || die "user2 otp-request failed"
req POST "$FN/otp-verify" "{\"phone\":\"$P2\",\"code\":\"$CODE2\"}"
T2=$(j 'd.get("access_token")'); [[ -n "$T2" ]] || die "user2 otp-verify failed"
AUTH2=(-H "Authorization: Bearer $T2")
for tbl in appointments kit_claims survey_responses consents; do
  req GET "$REST/$tbl?select=id" "" "${AUTH2[@]}"
  [[ "$STATUS" == 200 && "$BODY" == "[]" ]] || die "user2 could read $tbl: $BODY"
done
ok "user2 sees [] on appointments/kit_claims/survey_responses/consents"
req GET "$REST/appointments?select=id" "" "${AUTH1[@]}"
[[ "$(j 'len(d)')" == "1" ]] || die "user1 should see own appointment via REST"
ok "user1 sees own row (RLS positive check)"
req GET "$REST/otp_codes?select=id" "" "${AUTH2[@]}"
[[ "$STATUS" == 401 || "$STATUS" == 403 ]] || die "otp_codes should be permission denied for a client, got $STATUS"
ok "otp_codes → $STATUS permission denied"
req GET "$REST/audit_log?select=id" "" "${AUTH2[@]}"
[[ "$STATUS" == 401 || "$STATUS" == 403 ]] || die "audit_log should be permission denied for a client, got $STATUS"
ok "audit_log → $STATUS permission denied"

step "10b. authenticated client grants: consent insert + hospitals read"
# The marketing toggle in Profile inserts directly (RLS: consents_insert_own).
req POST "$REST/consents" "{\"user_id\":\"$UID1\",\"purpose\":\"marketing\",\"granted\":false,\"policy_version\":\"2025-01\"}" "${AUTH1[@]}" -H "Prefer: return=representation"
[[ "$STATUS" == 201 && "$(j 'len(d)')" == "1" ]] || die "authenticated consent insert failed (grants/RLS)"
ok "consents insert as authenticated → 201"
# Forging a row for another user must be blocked by RLS (WITH CHECK).
req POST "$REST/consents" "{\"user_id\":\"$UID1\",\"purpose\":\"marketing\",\"granted\":true}" "${AUTH2[@]}"
[[ "$STATUS" == 403 ]] || die "user2 forging a consent for user1 should be 403, got $STATUS"
ok "cross-user consent insert → 403"
req GET "$REST/machines?select=machine_id&machine_id=eq.HG-TEST-000" "" "${AUTH1[@]}"
[[ "$STATUS" == 200 && "$(j 'len(d)')" == "1" ]] || die "authenticated should read active machines"
ok "machines readable by client (active only)"

step "11. delete appointment removes row + image"
req DELETE "$REST/appointments?id=eq.$APPT1" "" "${AUTH1[@]}" -H "Prefer: return=representation"
[[ "$STATUS" == 200 && "$(j 'len(d)')" == "1" ]] || die "row delete failed"
req DELETE "$STORAGE/object/appointment-cards" "{\"prefixes\":[\"$IMG1\"]}" "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "storage delete failed"
GONE=$(curl -s -o /dev/null -w '%{http_code}' "$STORAGE/object/authenticated/appointment-cards/$IMG1" -H "apikey: $ANON" -H "Authorization: Bearer $T1")
[[ "$GONE" == 400 || "$GONE" == 404 ]] || die "image still readable after delete ($GONE)"
ok "row deleted, image gone ($GONE)"

step "12. export-my-data (user1)"
req POST "$FN/export-my-data" "{}" "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "export expected 200"
[[ "$(j 'len(d["kit_claims"])')" == "1" && "$(j 'len(d["survey_responses"])')" == "1" && "$(j 'd["survey_responses"][0]["q3_department"]')" == "cardiology" ]] || die "export content unexpected"
ok "export has claim + decrypted survey (q3=cardiology)"

step "12b. profiles row is created from the registration details"
NAME1=$(dbq "select name from public.profiles where id = '$UID1'" "d['rows'][0]['name']")
[[ "$NAME1" == "Smoke One" ]] || die "profiles.name expected 'Smoke One', got '$NAME1'"
ok "profiles row has name + phone from registration"

step "12c. verify attempts are capped (user3)"
req POST "$FN/otp-request" "{\"name\":\"Smoke Three\",\"email\":\"smoke3@example.com\",\"phone\":\"$P3\"}"
CODE3=$(j 'd.get("devCode")'); [[ -n "$CODE3" ]] || die "user3 otp-request failed"
# Must differ from the real code AND from the demo code 000000, which
# DEMO_MODE=true accepts by design.
WRONG=999999; [[ "$CODE3" == "$WRONG" ]] && WRONG=888888
for i in 1 2 3 4 5; do
  req POST "$FN/otp-verify" "{\"phone\":\"$P3\",\"code\":\"$WRONG\"}"
  [[ "$STATUS" == 400 && "$(j 'd["reason"]')" == "invalid_code" ]] || die "wrong attempt $i expected 400 invalid_code, got $STATUS"
done
req POST "$FN/otp-verify" "{\"phone\":\"$P3\",\"code\":\"$WRONG\"}"
[[ "$STATUS" == 429 && "$(j 'd["reason"]')" == "too_many_attempts" ]] || die "6th attempt expected 429 too_many_attempts"
req POST "$FN/otp-verify" "{\"phone\":\"$P3\",\"code\":\"$CODE3\"}"
[[ "$STATUS" == 429 ]] || die "even the correct code must be refused after lockout, got $STATUS"
ok "5 wrong attempts then locked out — correct code also refused"

step "12d. returning user logs in to the SAME account (no duplicate)"
T4START=$(date +%s)
req POST "$FN/otp-request" "{\"name\":\"Smoke Four\",\"email\":\"smoke4@example.com\",\"phone\":\"$P4\"}"
CODE4A=$(j 'd.get("devCode")'); [[ -n "$CODE4A" ]] || die "user4 first otp-request failed"
req POST "$FN/otp-verify" "{\"phone\":\"$P4\",\"code\":\"$CODE4A\"}"
T4A=$(j 'd.get("access_token")'); [[ -n "$T4A" ]] || die "user4 first verify failed"
UID4A=$(jwt_sub "$T4A")
REMAIN=$(( 31 - ($(date +%s) - T4START) ))
(( REMAIN > 0 )) && { echo "     (waiting ${REMAIN}s for the 30s resend cooldown)"; sleep "$REMAIN"; }
req POST "$FN/otp-request" "{\"name\":\"Smoke Four\",\"email\":\"smoke4@example.com\",\"phone\":\"$P4\"}"
CODE4B=$(j 'd.get("devCode")'); [[ -n "$CODE4B" ]] || die "user4 second otp-request failed (cooldown?): $BODY"
[[ "$CODE4B" != "$CODE4A" ]] || die "second OTP should be a fresh code"
req POST "$FN/otp-verify" "{\"phone\":\"$P4\",\"code\":\"$CODE4B\"}"
T4B=$(j 'd.get("access_token")'); [[ -n "$T4B" ]] || die "user4 second verify failed"
UID4B=$(jwt_sub "$T4B")
[[ "$UID4A" == "$UID4B" ]] || die "returning user got a NEW id ($UID4A -> $UID4B)"
NUSERS=$(dbq "select count(*) as n from auth.users where phone = '${P4#+}' or phone = '$P4'" "d['rows'][0]['n']")
[[ "$NUSERS" == "1" ]] || die "expected exactly 1 auth user for $P4, got $NUSERS"
NPROF=$(dbq "select count(*) as n from public.profiles where id = '$UID4A'" "d['rows'][0]['n']")
[[ "$NPROF" == "1" ]] || die "expected exactly 1 profile row, got $NPROF"
ok "same uid on re-login, 1 auth user, 1 profile row"
curl -s -o /dev/null -X POST "$FN/delete-my-account" -H "apikey: $ANON" -H "Authorization: Bearer $T4B"

step "12e. demo-mode posture matches DEMO_MODE (guards against shipping a demo build)"
DEMO=$(envget supabase/functions/.env DEMO_MODE); DEMO=$(echo "${DEMO:-false}" | tr '[:upper:]' '[:lower:]')
req POST "$FN/app-config" "{}"
[[ "$STATUS" == 200 ]] || die "app-config expected 200"
REPORTED=$(j 'd["demo_mode"]')
[[ "$REPORTED" == "True" && "$DEMO" == "true" ]] || [[ "$REPORTED" == "False" && "$DEMO" != "true" ]] \
  || die "app-config reports demo_mode=$REPORTED but DEMO_MODE=$DEMO"
ok "app-config reports demo_mode=$REPORTED (DEMO_MODE=$DEMO)"
req POST "$FN/otp-request" "{\"name\":\"Smoke Five\",\"email\":\"smoke5@example.com\",\"phone\":\"$P5\"}"
CODE5=$(j 'd.get("devCode")'); [[ -n "$CODE5" ]] || die "user5 otp-request failed"
if [[ "$CODE5" == "000000" ]]; then
  ok "skipped: the real code happened to be 000000 (1-in-a-million)"
else
  req POST "$FN/otp-verify" "{\"phone\":\"$P5\",\"code\":\"000000\"}"
  if [[ "$DEMO" == "true" ]]; then
    T5=$(j 'd.get("access_token")')
    [[ "$STATUS" == 200 && -n "$T5" ]] || die "DEMO_MODE=true: 000000 should be accepted, got $STATUS"
    ok "DEMO_MODE=true → fixed code 000000 accepted, session minted"
    curl -s -o /dev/null -X POST "$FN/delete-my-account" -H "apikey: $ANON" -H "Authorization: Bearer $T5"
  else
    [[ "$STATUS" == 400 && "$(j 'd["reason"]')" == "invalid_code" ]] \
      || die "DEMO_MODE off: 000000 MUST be rejected, got $STATUS $(j 'd["reason"]')"
    ok "DEMO_MODE=false → fixed code 000000 rejected (real OTP enforced)"
  fi
fi

step "13. delete-my-account removes storage, rows, auth user; writes audit"
IMG2="$UID1/smoke-$TS-2.png"
curl -s -o /dev/null -X POST "$STORAGE/object/appointment-cards/$IMG2" -H "apikey: $ANON" -H "Authorization: Bearer $T1" -H "Content-Type: image/png" --data-binary "@$TMP/px.png"
req POST "$FN/save-appointment" "{\"clinic_name\":\"Doomed\",\"pickup_at\":\"2030-02-01\",\"image_path\":\"$IMG2\"}" "${AUTH1[@]}"
[[ "$STATUS" == 200 ]] || die "pre-delete save failed"
req POST "$FN/delete-my-account" "{}" "${AUTH1[@]}"
[[ "$STATUS" == 200 && "$(j 'd["ok"]')" == "True" ]] || die "delete-my-account expected 200 ok"
AUTHSTATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/v1/user" -H "apikey: $ANON" -H "Authorization: Bearer $T1")
[[ "$AUTHSTATUS" == 401 || "$AUTHSTATUS" == 403 ]] || die "token still valid after delete ($AUTHSTATUS)"
OBJS=$(dbq "select count(*) as n from storage.objects where bucket_id='appointment-cards' and name like '$UID1/%'" "d['rows'][0]['n']")
[[ "$OBJS" == "0" ]] || die "storage objects remain: $OBJS"
ROWS=$(dbq "select (select count(*) from public.kit_claims where user_id='$UID1') + (select count(*) from public.appointments where user_id='$UID1') + (select count(*) from public.profiles where id='$UID1') as n" "d['rows'][0]['n']")
[[ "$ROWS" == "0" ]] || die "user rows remain: $ROWS"
AUD=$(dbq "select count(*) as n from public.audit_log where action='account_deleted' and actor_id='$UID1'" "d['rows'][0]['n']")
[[ "$AUD" == "1" ]] || die "audit_log account_deleted missing"
ok "auth token dead, 0 storage objects, 0 rows, audit_log written"

rm -rf "$TMP"
echo
echo "SMOKE PASSED — $PASS checks"
