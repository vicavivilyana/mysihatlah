/**
 * QR payload format — the ONE place the on-screen QR's contents are decided.
 *
 * The vending machine's scanner reads whatever this produces. Which format a
 * given machine needs is a hardware detail we may not know until install, so
 * it is a config flag (VITE_QR_PAYLOAD_MODE), not code:
 *
 *   json  (default) {"v":1,"token":"…","hospital_id":"…","machine_id":"…","issued_at":"…"}
 *   token           the bare release token, nothing else
 *   url             https://<app-domain>/r/<token>   (VITE_QR_URL_BASE)
 *
 * To change format in the field: set the env var and redeploy the client.
 * Nothing else in the claim or release path depends on the shape.
 */

export const QR_PAYLOAD_MODES = ['json', 'token', 'url'] as const;
export type QrPayloadMode = (typeof QR_PAYLOAD_MODES)[number];

/** Bump if the json shape ever changes, so machines can branch on it. */
export const QR_PAYLOAD_VERSION = 1;

function configuredMode(): QrPayloadMode {
  const raw = (import.meta.env.VITE_QR_PAYLOAD_MODE ?? 'json').trim().toLowerCase();
  if ((QR_PAYLOAD_MODES as readonly string[]).includes(raw)) return raw as QrPayloadMode;
  console.warn(
    `[HealthGo] VITE_QR_PAYLOAD_MODE="${raw}" is not one of ${QR_PAYLOAD_MODES.join(' | ')}. Falling back to "json".`,
  );
  return 'json';
}

export const QR_PAYLOAD_MODE: QrPayloadMode = configuredMode();

export interface ReleaseQrData {
  token: string;
  hospitalId: string;
  machineId: string;
  /** ISO8601 — when the token was issued. */
  issuedAt: string;
}

function urlBase(): string {
  const configured = import.meta.env.VITE_QR_URL_BASE?.trim();
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
}

/** Build the exact string encoded into the QR shown to the machine. */
export function buildQrPayload(data: ReleaseQrData, mode: QrPayloadMode = QR_PAYLOAD_MODE): string {
  switch (mode) {
    case 'token':
      return data.token;
    case 'url':
      return `${urlBase()}/r/${encodeURIComponent(data.token)}`;
    case 'json':
    default:
      return JSON.stringify({
        v: QR_PAYLOAD_VERSION,
        token: data.token,
        hospital_id: data.hospitalId,
        machine_id: data.machineId,
        issued_at: data.issuedAt,
      });
  }
}
