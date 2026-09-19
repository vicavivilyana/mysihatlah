import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { SurveyAnswers } from './api';

const Q1 = ['self', 'parents', 'child', 'accompanying'];
const Q2 = ['below20', '20to30', '30to40', '40to50', '50plus'];
const Q3 = ['cardiology', 'orthopaedic', 'oncology', 'ong', 'paediatric', 'pharmacy', 'diagnostic', 'emergency'];
const Q4 = ['food', 'parking', 'transport', 'others'];

function OptionGrid({
  options,
  value,
  onChange,
  tPrefix,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  tPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            value === opt ? 'bg-navy text-white shadow-card' : 'border border-hairline bg-white text-ink'
          }`}
        >
          {t(`${tPrefix}.${opt}`)}
        </button>
      ))}
    </div>
  );
}

export default function SurveyForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (answers: SurveyAnswers) => void;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('');
  const [q4Other, setQ4Other] = useState('');
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);

  const answered = q1 && q2 && q3 && q4 && (q4 !== 'others' || q4Other.trim().length > 0);
  const canSubmit = answered && terms && !submitting;

  function handleSubmit() {
    if (!terms) {
      setShowTermsError(true);
      return;
    }
    if (!answered) return;
    onSubmit({
      q1_for_whom: q1,
      q2_age: q2,
      q3_department: q3,
      q4_need: q4,
      q4_other_text: q4 === 'others' ? q4Other.trim() : undefined,
      terms_accepted: terms,
      marketing_opt_in: marketing,
    });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="mb-3 font-semibold text-ink">{t('survey.q1')}</p>
        <OptionGrid options={Q1} value={q1} onChange={setQ1} tPrefix="survey.q1opts" />
      </div>
      <div className="card">
        <p className="mb-3 font-semibold text-ink">{t('survey.q2')}</p>
        <OptionGrid options={Q2} value={q2} onChange={setQ2} tPrefix="survey.q2opts" />
      </div>
      <div className="card">
        <p className="mb-3 font-semibold text-ink">{t('survey.q3')}</p>
        <OptionGrid options={Q3} value={q3} onChange={setQ3} tPrefix="survey.q3opts" />
      </div>
      <div className="card">
        <p className="mb-3 font-semibold text-ink">{t('survey.q4')}</p>
        <OptionGrid options={Q4} value={q4} onChange={setQ4} tPrefix="survey.q4opts" />
        {q4 === 'others' && (
          <input
            className="field-input mt-3"
            placeholder={t('survey.q4otherPlaceholder')}
            value={q4Other}
            onChange={(e) => setQ4Other(e.target.value)}
          />
        )}
      </div>

      <div className="card">
        <p className="mb-3 font-semibold text-ink">{t('survey.q5')}</p>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-navy"
            checked={terms}
            onChange={(e) => {
              setTerms(e.target.checked);
              if (e.target.checked) setShowTermsError(false);
            }}
          />
          <span className="text-sm text-ink">
            {t('survey.termsLabel')}{' '}
            <a href="/PRIVACY_POLICY.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-navy underline">
              {t('profile.privacyPolicy')} <ExternalLink size={12} />
            </a>
            <span className="ml-1 text-red">*</span>
          </span>
        </label>
        {showTermsError && <p className="mt-2 text-sm font-medium text-red">{t('survey.termsRequired')}</p>}

        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-navy" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span className="text-sm text-ink-muted">{t('survey.marketingLabel')}</span>
        </label>
      </div>

      <button className="btn-gold" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? t('kit.claiming') : t('survey.submit')}
      </button>
    </div>
  );
}
