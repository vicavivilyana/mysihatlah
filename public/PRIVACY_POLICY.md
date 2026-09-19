# HealthGo Privacy Policy (DRAFT)

**Policy version:** 2025-01
**Last updated:** _[TODO before go-live]_
**Data controller:** MekxTech _[TODO: full legal entity, address]_
**Data Protection Officer:** _[TODO: name, email, phone]_

> This is a working draft. Have it reviewed by legal counsel and host the final
> version at a stable public URL before submitting to the App Store / Google Play.

## 1. Who we are

HealthGo is a hospital-visit companion app operated by MekxTech. This policy
explains what personal data we collect, why, who we share it with, how long we
keep it, and your rights under Malaysia's Personal Data Protection Act 2010
(PDPA, as amended 2024–2025).

## 2. What we collect

- **Registration:** full name, email address, mobile number (verified by OTP).
- **Welcome-kit survey:** who you are visiting for, age group, department
  visited, your biggest need, and free text if you choose "Others". Department
  and need are **health-related** and treated as sensitive personal data.
- **Dispenser context:** the hospital, machine, location and time recorded when
  you claim a kit.
- **Appointment reminders:** the appointment-card photo you take and the details
  extracted from it (clinic/hospital, follow-up and medicine-pickup dates,
  reference number). These are **health-related** sensitive data.
- **Consents:** your acceptance of these terms and your marketing preference.
- **Location:** your device location, used only in-app to center the Nearby map.
  It is not stored on our servers.

## 3. Why we use it (purpose)

- To verify your identity and secure your account (OTP).
- To provide the one-time free welcome kit and prevent duplicate claims.
- To generate appointment reminders and calendar entries for you.
- To show nearby food, pharmacies and clinics on a map.
- To understand visitor needs in aggregate to improve hospital services.
- To send promotions **only if** you opted in.

We rely on your **explicit consent** for sensitive (health) data, collected at
registration and before releasing your kit.

## 4. How we protect it

Data is encrypted in transit (TLS) and at rest. Sensitive fields (department,
need, clinic name, reference number, OCR text) are additionally encrypted at the
application layer. Appointment images are stored privately and served only via
short-lived signed links. Access is restricted per user by database-enforced
row-level security. See our Security overview for details.

## 5. Who we share it with

We do not sell your data. We use trusted processors to run the service:

- **Supabase** — database, authentication, storage, and server functions.
- **Google** — Maps and Places (to display the Nearby map).
- **SMS provider** — to deliver your one-time verification code (once enabled).
- **Cloudflare** — app hosting / content delivery.

Each processor is bound by a data processing agreement.

## 6. How long we keep it

We keep data only as long as needed for the purposes above. OTP codes and unused
kit-release tokens expire within minutes. Appointment records are purged after a
retention window (default 12 months) unless you delete them sooner. You can
delete your account and all associated data at any time.

## 7. Your rights

Under the PDPA you may:

- **Access / export** the data we hold about you (in-app "Export my data").
- **Correct** inaccurate data (edit appointments in-app).
- **Withdraw consent**, including marketing (in-app Profile).
- **Delete** your account and data (in-app "Delete my account & data").
- **Lodge a complaint** with the Personal Data Protection Department (JPDP).

To exercise rights not available in-app, contact our DPO above.

## 8. Children

HealthGo is intended for adults. We do not knowingly collect data from children
without appropriate guardian consent.

## 9. Changes

We will update this policy as needed and change the policy version. Material
changes will be notified in-app.

## 10. Contact

_[TODO: support email, DPO email, postal address]_
