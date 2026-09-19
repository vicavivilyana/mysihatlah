import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, LANG_SHORT, LANG_LABELS, setLanguage, type Lang } from '@/i18n';

/** English · Bahasa Malaysia · 中文 — in that order, English default. */
export default function LanguageToggle({ full = false }: { full?: boolean }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage as Lang) ?? 'en';
  return (
    <div className="inline-flex rounded-pill border border-hairline bg-white p-1">
      {SUPPORTED_LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={current === lang}
          className={`min-h-[36px] rounded-pill px-3 text-xs font-semibold transition duration-200 ease-soft ${
            current === lang ? 'bg-navy text-white' : 'text-ink-muted hover:text-navy'
          }`}
        >
          {full ? LANG_LABELS[lang] : LANG_SHORT[lang]}
        </button>
      ))}
    </div>
  );
}
