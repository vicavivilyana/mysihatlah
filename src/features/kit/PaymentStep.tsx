import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, RotateCcw, FlaskConical } from 'lucide-react';
import { getPaymentProvider } from './payment/PaymentProvider';

/**
 * RM20 refundable deposit. The provider here is the MOCK one — nothing is
 * charged, and the button says so. A real Fiuu flow will redirect out to the
 * gateway and the server will re-verify before the QR is issued.
 */
export default function PaymentStep({
  claimId,
  amountCents,
  currency,
  onPaid,
  onCancel,
  error,
}: {
  claimId: string;
  amountCents: number;
  currency: string;
  onPaid: (ref?: string) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [paying, setPaying] = useState(false);
  const provider = getPaymentProvider();
  const amount = `${currency} ${(amountCents / 100).toFixed(2)}`;

  async function pay() {
    setPaying(true);
    try {
      const out = await provider.pay({ claimId, amountCents, currency });
      if (out.ok) onPaid(out.ref);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-6">
      <h1 className="text-[26px] font-bold leading-tight text-navy">{t('deposit.title')}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{t('deposit.subtitle')}</p>

      {/* Amount */}
      <div className="card mt-7 text-center">
        <p className="eyebrow">{t('deposit.amountLabel')}</p>
        <p className="mt-2 font-serif text-[40px] font-bold leading-none text-navy">{amount}</p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-gold">
          <RotateCcw size={15} /> {t('deposit.refundable')}
        </p>
      </div>

      {/* How the refund works */}
      <div className="mt-4 flex items-start gap-3 rounded-card border border-hairline bg-white p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-navy" />
        <p className="text-sm leading-relaxed text-ink-muted">{t('deposit.explainer')}</p>
      </div>

      {/* Unmistakably a simulation */}
      {provider.isMock && (
        <div className="mt-4 flex items-start gap-3 rounded-card border border-gold/30 bg-gold-wash p-4">
          <FlaskConical size={18} className="mt-0.5 shrink-0 text-gold" />
          <p className="text-sm leading-relaxed text-ink">{t('deposit.mockNotice')}</p>
        </div>
      )}

      {error && <p className="mt-5 text-sm font-semibold text-red">{error}</p>}

      <div className="mt-auto pt-8">
        <button className="btn-gold" disabled={paying} onClick={pay}>
          {paying ? t('deposit.processing') : t('deposit.payMock', { amount })}
        </button>
        <button className="btn-quiet mt-2 !min-h-[44px] text-sm" onClick={onCancel} disabled={paying}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
