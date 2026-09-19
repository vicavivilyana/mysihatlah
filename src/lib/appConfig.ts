import { invokeFunction, hasSupabaseConfig } from './supabase';

/**
 * Backend posture the UI must surface. `demo_mode` is owned by the server
 * (env DEMO_MODE) — deliberately NOT a VITE_ var, so a demo build is decided
 * by the backend it talks to, not by how the bundle was compiled.
 */
export interface AppConfig {
  demo_mode: boolean;
  policy_version: string | null;
}

const FALLBACK: AppConfig = { demo_mode: false, policy_version: null };

let cache: Promise<AppConfig> | null = null;

/** Fetched once per session; failures degrade to "not demo" and never throw. */
export function fetchAppConfig(): Promise<AppConfig> {
  if (!hasSupabaseConfig) return Promise.resolve(FALLBACK);
  cache ??= invokeFunction<AppConfig>('app-config')
    .then((c) => ({
      demo_mode: c?.demo_mode === true,
      policy_version: c?.policy_version ?? null,
    }))
    .catch(() => FALLBACK);
  return cache;
}
