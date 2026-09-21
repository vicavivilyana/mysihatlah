import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { Logo, Wordmark } from '@/components/Brand';
import type { SurveyAnswers } from './api';

const Q1 = ['self', 'parents', 'child', 'accompanying'];
const Q2 = ['below20', '20to30', '30to40', '40to50', '50plus'];
const Q3 = ['cardiology', 'orthopaedic', 'oncology', 'ong', 'paediatric', 'pharmacy', 'diagnostic', 'emergency'];
const Q4 = ['food', 'parking', 'transport', 'others'];

const TOTAL = 5;

interface StepDef {
  key: 'q1' | 'q2' | 'q3' | 'q4';
  options: string[];
  optsPrefix: string;
}
const STEPS: StepDef[] = [
  { key: 'q1', options: Q1, optsPrefix: 'survey.q1opts' },
  { key: 'q2', options: Q2, optsPrefix: 'survey.q2opts' },
  { key: 'q3', options: Q3, optsPrefix: 'survey.q3opts' },
  { key: 'q4', options: Q4, optsPrefix: 'survey.q4opts' },
];

/** Segmented gold progress, one segment per question. */
function Progress({ step }: { step: number }) {
  return (
    <div className="mt-3 flex gap-1.5">
      {Array.from({ length: TOTAL }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ease-soft ${
            i <= step ? 'bg-gold' : 'bg-hairline'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * One question per screen (mockup): gold "Question n of 5" + segmented bar,
 * question in the active language with an English sub-label when the user is
 * not already reading English, option cards, navy Continue.
 */
export default function SurveyForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (answers: SurveyAnswers) => void;
  submitting: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0); // 0..3 = Q1..Q4, 4 = consent
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [q4Other, setQ4Other] = useState('');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);

  // Secondary English label, shown only when the UI is not already English.
  const en = useMemo(() => i18n.getFixedT('en'), [i18n]);
  const showEn = i18n.resolvedLanguage !== 'en';

  const isConsent = step === TOTAL - 1;
  const current = STEPS[step];

  const canContinue = isConsent
    ? terms
    : Boolean(answers[current.key]) && (current.key !== 'q4' || answers.q4 !== 'others' || q4Other.trim().length > 0);

  function next() {
    if (isConsent) {
      if (!terms) {
        setShowTermsError(true);
        return;
      }
      onSubmit({
        q1_for_whom: answers.q1,
        q2_age: answers.q2,
        q3_department: answers.q3,
        q4_need: answers.q4,
        q4_other_text: answers.q4 === 'others' ? q4Other.trim() : undefined,
        terms_accepted: terms,
        marketing_opt_in: marketing,
      });
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-4">
      {/* Header: progress + wordmark */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              aria-label={t('common.back')}
              className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-navy"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <span className="text-sm font-bold text-gold">
            {t('survey.questionOf', { n: step + 1, total: TOTAL })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Logo size={20} />
          <Wordmark className="text-sm" />
        </div>
      </div>
      <Progress step={step} />

      {/* Question */}
      <h1 className="mt-8 text-[26px] font-bold leading-tight text-navy">
        {isConsent ? t('survey.consentTitle') : t(`survey.${current.key}`)}
      </h1>
      {showEn && (
        <p className="mt-2 text-[15px] text-ink-muted">
          {isConsent ? en('survey.consentTitle') : en(`survey.${current.key}`)}
        </p>
      )}
      {isConsent && !showEn && <p className="mt-2 text-[15px] text-ink-muted">{t('survey.consentSub')}</p>}

      {/* Body */}
      <div className="mt-7 flex-1 space-y-3">
        {!isConsent &&
          current.options.map((opt) => {
            const selected = answers[current.key] === opt;
            return (
              <button
                key={opt}
                onClick={() => setAnswers((a) => ({ ...a, [current.key]: opt }))}
                className={`flex w-full items-center gap-3.5 rounded-card border bg-white p-4 text-left transition duration-200 ease-soft active:scale-[0.99] ${
                  selected ? 'border-navy shadow-card' : 'border-hairline'
                }`}
              >
                <span className={`h-10 w-10 shrink-0 rounded-xl transition ${selected ? 'bg-navy' : 'bg-sand'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-tight text-ink">{t(`${current.optsPrefix}.${opt}`)}</span>
                  {showEn && (
                    <span className="mt-0.5 block text-sm text-ink-muted">{en(`${current.optsPrefix}.${opt}`)}</span>
                  )}
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    selected ? 'border-navy' : 'border-hairline'
                  }`}
                >
                  {selected && <span className="h-3 w-3 rounded-full bg-navy" />}
                </span>
              </button>
            );
          })}

        {!isConsent && current.key === 'q4' && answers.q4 === 'others' && (
          <input
            className="field-input"
            placeholder={t('survey.q4otherPlaceholder')}
            value={q4Other}
            onChange={(e) => setQ4Other(e.target.value)}
            autoFocus
          />
        )}

        {isConsent && (
          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-card border border-hairline bg-white p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                checked={terms}
                onChange={(e) => {
                  setTerms(e.target.checked);
                  if (e.target.checked) setShowTermsError(false);
                }}
              />
              <span className="text-sm leading-relaxed text-ink">
                {t('survey.termsLabel')}{' '}
                <a href="/PRIVACY_POLICY.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-navy underline">
                  {t('profile.privacyPolicy')} <ExternalLink size={12} />
                </a>
                <span className="ml-1 text-red">*</span>
              </span>
            </label>
            {showTermsError && <p className="text-sm font-semibold text-red">{t('survey.termsRequired')}</p>}

            <label className="flex items-start gap-3 rounded-card border border-hairline bg-white p-4">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span className="text-sm leading-relaxed text-ink-muted">{t('survey.marketingLabel')}</span>
            </label>
          </div>
        )}
      </div>

      <button className="btn-primary mt-8" disabled={!canContinue || submitting} onClick={next}>
        {submitting ? t('kit.claiming') : isConsent ? t('survey.submit') : t('survey.continue')}
      </button>
    </div>
  );
}
