import { useTranslation } from 'react-i18next';
import { Pill } from 'lucide-react';

/**
 * Medication tracker — tab placeholder.
 * The full feature (add medication, daily dose tick-off, adherence bar,
 * low-stock refill reminder, `medications` table + RLS) lands in phase 3.
 */
export default function MedsScreen() {
  const { t } = useTranslation();
  return (
    <div className="px-5 pt-8 safe-top">
      <h1 className="h-display">{t('meds.title')}</h1>
      <div className="card mt-8 flex flex-col items-center py-12 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-card bg-navy/5 text-navy">
          <Pill size={28} />
        </span>
        <span className="chip-gold mt-5">{t('comingSoon.launching')}</span>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">{t('meds.stubBody')}</p>
      </div>
    </div>
  );
}
