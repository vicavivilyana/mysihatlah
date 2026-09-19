// Field-level encryption (AES-256-GCM, key FIELD_ENCRYPTION_KEY) and OTP
// hashing (HMAC-SHA-256, key OTP_PEPPER). Web Crypto only. Both keys live
// solely in the server env; a missing/malformed key fails loudly by name.
import { requireEnv } from './env.ts';

const ENC_PREFIX = 'gcm1';

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// --- Field encryption ---------------------------------------------------------

function encryptionKeyBytes(fn: string): Uint8Array {
  const b64 = requireEnv('FIELD_ENCRYPTION_KEY', fn);
  let raw: Uint8Array;
  try {
    raw = fromB64(b64);
  } catch {
    console.error(`[${fn}] FIELD_ENCRYPTION_KEY is not valid base64. Generate one with: openssl rand -base64 32`);
    throw new Error('bad_env:FIELD_ENCRYPTION_KEY');
  }
  if (raw.length !== 32) {
    console.error(
      `[${fn}] FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${raw.length}). Generate one with: openssl rand -base64 32`,
    );
    throw new Error('bad_env:FIELD_ENCRYPTION_KEY');
  }
  return raw;
}

async function aesKey(fn: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encryptionKeyBytes(fn), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypt a string → "gcm1.<ivB64>.<cipherB64>". Null/empty passes through. */
export async function encryptField(plain: string | null | undefined, fn = 'crypto'): Promise<string | null> {
  if (plain === null || plain === undefined || plain === '') return plain ?? null;
  const key = await aesKey(fn);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `${ENC_PREFIX}.${toB64(iv)}.${toB64(ct)}`;
}

/** Decrypt "gcm1.<iv>.<ct>". Non-encrypted values pass through unchanged. */
export async function decryptField(value: string | null | undefined, fn = 'crypto'): Promise<string | null> {
  if (value === null || value === undefined || value === '') return value ?? null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== ENC_PREFIX) return value;
  const key = await aesKey(fn);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts[1]) }, key, fromB64(parts[2]));
    return new TextDecoder().decode(pt);
  } catch {
    // AES-GCM authentication failed: wrong key (rotated?) or corrupted ciphertext.
    console.error(
      `[${fn}] decryptField failed: FIELD_ENCRYPTION_KEY does not match the key this value was encrypted with (or the ciphertext is corrupt).`,
    );
    throw new Error('decrypt_failed');
  }
}

// --- OTP hashing --------------------------------------------------------------

async function pepperKey(fn: string): Promise<CryptoKey> {
  const pepper = requireEnv('OTP_PEPPER', fn);
  if (pepper.length < 16) {
    console.error(`[${fn}] OTP_PEPPER is too short (min 16 chars). Generate one with: openssl rand -base64 32`);
    throw new Error('bad_env:OTP_PEPPER');
  }
  return crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * HMAC-SHA-256(OTP_PEPPER, code:phone). A leaked otp_codes table cannot be
 * brute-forced offline (6 digits) without the server-side pepper.
 */
export async function hashOtp(code: string, phone: string, fn = 'crypto'): Promise<string> {
  const key = await pepperKey(fn);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${code}:${phone}`)));
  return toB64(sig);
}

/** Constant-time comparison (HMAC outputs are fixed-length, so length isn't a leak). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Uniform 6-digit code from crypto.getRandomValues (rejection sampling, no modulo bias). */
export function generateOtp(): string {
  const LIMIT = 1_000_000;
  const MAX_UNBIASED = Math.floor(0x1_0000_0000 / LIMIT) * LIMIT;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= MAX_UNBIASED);
  return (n % LIMIT).toString().padStart(6, '0');
}

/** 192-bit URL-safe random token for kit release. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return toB64(bytes).replace(/[+/=]/g, (m) => ({ '+': '-', '/': '_', '=': '' })[m] as string);
}
