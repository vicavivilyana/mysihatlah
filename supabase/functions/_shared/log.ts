// Structured error logging: [fn-name] step {message, code, details, hint}.
// Callers must never pass OTP codes, tokens, secrets or decrypted PII here.

interface ErrShape {
  name?: string;
  message?: string;
  code?: string | number;
  details?: string;
  hint?: string;
  status?: number;
}

export function logError(fn: string, step: string, err: unknown): void {
  const e = (err ?? {}) as ErrShape;
  const payload = {
    name: e.name,
    message: e.message ?? (typeof err === 'string' ? err : String(err)),
    code: e.code,
    details: e.details,
    hint: e.hint,
    status: e.status,
  };
  console.error(`[${fn}] ${step}`, JSON.stringify(payload));
}

export function logWarn(fn: string, step: string, message: string): void {
  console.warn(`[${fn}] ${step}: ${message}`);
}
