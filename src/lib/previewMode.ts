/**
 * ============================================================================
 * TEMPORARY UI-PREVIEW BYPASS — dev/testing only. OFF unless VITE_SKIP_AUTH
 * is exactly the string "true".
 * ============================================================================
 *
 * What it does: lets the app render past the login/registration redirect so the
 * UI can be viewed on a phone or another device without signing in.
 *
 * What it deliberately does NOT do:
 *   • It does NOT create or fake a Supabase session.
 *   • It does NOT fake any data or API response.
 * Anything that needs a real session simply fails as it normally would and the
 * screen shows its own empty/error state. This is a visual preview, nothing more.
 *
 * TO REMOVE COMPLETELY (one step): delete this file and the three imports of it
 *   - src/App.tsx              (routing bypass)
 *   - src/store/auth.tsx       (guest identity)
 *   - src/components/PreviewBanner.tsx (delete too; only used for this)
 * plus the `body.preview-mode` rule in src/index.css. Nothing else references it.
 *
 * MUST be false/absent in production.
 */
export const PREVIEW_MODE = import.meta.env.VITE_SKIP_AUTH === 'true';

/**
 * A deliberately fake, obviously-local identity so screens have something to
 * render. It is never sent anywhere and carries no session or token — the id is
 * intentionally not a UUID so it cannot be mistaken for a real user id.
 */
export const PREVIEW_GUEST = {
  id: 'preview-guest-not-a-real-user',
  name: 'Preview Guest',
  phone: null,
  email: null,
  lang: null,
} as const;
