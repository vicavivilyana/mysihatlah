/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_POLICY_VERSION?: string;
  readonly VITE_QR_PAYLOAD_MODE?: 'json' | 'token' | 'url';
  readonly VITE_QR_URL_BASE?: string;
  readonly VITE_DEFAULT_MACHINE_ID?: string;
  readonly VITE_DEV_AUTOLOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
