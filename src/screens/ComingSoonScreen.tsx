import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import { findFeature } from '@/features/registry';

export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const { feature } = useParams<{ feature: string }>();
  const def = feature ? findFeature(feature) : undefined;
  const Icon = def?.Icon ?? Sparkles;
  const title = def ? t(def.labelKey) : t('comingSoon.title');

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-sand">
      <ScreenHeader title={title} />
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-card border border-hairline bg-white text-navy shadow-card">
          <Icon size={34} />
        </span>
        <span className="chip-gold mt-6">{t('comingSoon.launching')}</span>
        <h2 className="h-section mt-4 text-2xl">{title}</h2>
        <p className="mt-3 max-w-xs leading-relaxed text-ink-muted">
          {def?.descKey ? t(def.descKey) : t('comingSoon.body')}
        </p>
      </div>
    </div>
  );
}
