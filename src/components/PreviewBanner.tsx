import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { PREVIEW_MODE } from '@/lib/previewMode';

/**
 * Persistent, unmissable banner shown whenever the VITE_SKIP_AUTH preview
 * bypass is active, so a preview build can never be mistaken for a real
 * signed-in session. Pairs with `body.preview-mode` in index.css, which
 * reserves the space so the banner never covers content.
 */
export default function PreviewBanner() {
  const { t } = useTranslation();
  if (!PREVIEW_MODE) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex h-9 items-center justify-center gap-2 bg-red px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
    >
      <EyeOff size={13} />
      {t('preview.banner')}
    </div>
  );
}
