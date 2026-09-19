import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Package, TimerReset, ScanLine } from 'lucide-react';
import { buildQrPayload } from './qrPayload';
import type { ClaimKitResult } from './api';

const KIT_ITEMS = ['mask', 'wetTissue', 'dryTissue', 'sanitizer', 'powerBank'] as const;

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/**
 * "Show this to the machine" screen. Renders the one-time release token as a
 * QR (format decided by qrPayload.ts), counts down to token expiry, and offers
 * a new code once it lapses. The camera is not involved at any point.
 */
export default function ReleaseQr({
  claim,
  onDone,
  onRegenerate,
  regenerating,
  error,
}: {
  claim: ClaimKitResult;
  onDone: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const expiresAt = useMemo(() => new Date(claim.token_expires_at).getTime(), [claim.token_expires_at]);
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    setRemaining(expiresAt - Date.now());
    const id = setInterval(() => setRemaining(expiresAt - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = remaining <= 0;

  const payload = useMemo(
    () =>
      buildQrPayload({
        token: claim.release_token,
        hospitalId: claim.machine.hospital_id,
        machineId: claim.machine.machine_id,
        issuedAt: claim.issued_at,
      }),
    [claim],
  );

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-6 text-center">
      <h2 className="h-section">{expired ? t('kit.expiredTitle') : t('kit.qrTitle')}</h2>
      <p className="mt-2 text-sm text-ink-muted">{expired ? t('kit.expiredBody') : t('kit.qrBody')}</p>

      {/* QR / expired placeholder */}
      <div className="relative mt-6 rounded-card bg-white p-5 shadow-card">
        {expired ? (
          <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-3 text-ink-muted">
            <TimerReset size={40} />
            <span className="text-sm font-medium">{t('kit.expiredTitle')}</span>
          </div>
        ) : (
          <QRCodeSVG value={payload} size={220} level="M" marginSize={0} />
        )}
      </div>

      {!expired && (
        <>
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-navy">
            <ScanLine size={16} /> {t('kit.expiresIn', { time: mmss(remaining) })}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            {t('kit.waitingForMachine')}
          </p>
        </>
      )}

      {error && <p className="mt-4 text-sm font-medium text-red">{error}</p>}

      {expired && (
        <button className="btn-gold mt-6" disabled={regenerating} onClick={onRegenerate}>
          {regenerating ? t('common.loading') : t('kit.generateNew')}
        </button>
      )}

      {/* Kit contents */}
      <div className="card mt-6 w-full text-left">
        <p className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <Package size={18} className="text-navy" /> {t('kit.contents')}
        </p>
        <ul className="space-y-2">
          {KIT_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              {t(`kit.items.${item}`)}
            </li>
          ))}
        </ul>
      </div>

      {claim.machine.machine_id && (
        <p className="mt-4 text-xs text-ink-muted">
          {[claim.machine.hospital_name, claim.machine.location_name, claim.machine.machine_id]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <button className="btn-ghost mt-6" onClick={onDone}>
        {t('kit.done')}
      </button>
    </div>
  );
}
