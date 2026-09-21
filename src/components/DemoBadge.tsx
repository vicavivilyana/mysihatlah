import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAppConfig } from '@/lib/appConfig';
import { PREVIEW_MODE } from '@/lib/previewMode';

/**
 * Persistent "DEMO" badge, shown on every screen whenever the backend reports
 * DEMO_MODE=true — so a demo build can never be mistaken for the real thing.
 * Sits in the top safe-area gutter and is pointer-events-none, so it never
 * covers a tap target or alters any flow.
 */
export default function DemoBadge() {
  const { t } = useTranslation();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAppConfig().then((c) => {
      if (active) setDemo(c.demo_mode);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!demo) return null;

  return (
    <div
      role="status"
      title={t('demo.hint')}
      style={{ marginTop: `calc(env(safe-area-inset-top) + ${PREVIEW_MODE ? 36 : 0}px)` }}
      className="pointer-events-none fixed right-2 top-0 z-50 rounded-b-lg bg-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow"
    >
      {t('demo.badge')}
    </div>
  );
}
