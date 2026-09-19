/**
 * Capability checks. Every native-ish feature is used behind one of these so
 * the same code runs in the browser (PWA) today and inside a Capacitor WebView
 * later. When we add Capacitor, each check also probes the native plugin; the
 * calling UI never changes.
 */

export const isBrowser = typeof window !== 'undefined';

/** True when running inside a Capacitor native shell (set once we wrap). */
export function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function hasCamera(): boolean {
  return isBrowser && !!navigator.mediaDevices?.getUserMedia;
}

export function hasGeolocation(): boolean {
  return isBrowser && 'geolocation' in navigator;
}

export function hasNotifications(): boolean {
  return isBrowser && 'Notification' in window;
}

export function hasServiceWorker(): boolean {
  return isBrowser && 'serviceWorker' in navigator;
}

export function isOnline(): boolean {
  return !isBrowser || navigator.onLine;
}
