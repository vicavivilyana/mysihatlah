import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';
import { Logo, Wordmark } from '@/components/Brand';
import { requestOtp, verifyOtp } from '@/store/auth';
import { functionErrorKey } from '@/lib/supabase';

type Step = 'register' | 'otp';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const phoneValid = /^\+?[0-9\s-]{8,15}$/.test(phone.trim());
  const canRegister = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && phoneValid;

  async function handleRequest() {
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp(name.trim(), email.trim(), phone.trim());
      setDevCode(res.devCode);
      setStep('otp');
      setResendIn(res.resendAfter ?? 30);
    } catch (e) {
      setError(t(functionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(phone.trim(), code.trim());
    } catch (e) {
      setError(t(functionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-sand px-6 pb-10 pt-8 safe-top">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <Wordmark className="text-lg" />
        </div>
        <LanguageToggle />
      </div>

      {step === 'register' ? (
        <div className="flex flex-1 flex-col">
          <h1 className="h-display">{t('auth.welcomeTitle')}</h1>
          <p className="mt-3 leading-relaxed text-ink-muted">{t('auth.welcomeBody')}</p>

          <div className="mt-9 space-y-5">
            <div>
              <label className="field-label" htmlFor="name">{t('auth.fullName')}</label>
              <input id="name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className="field-label" htmlFor="email">{t('auth.email')}</label>
              <input id="email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
            </div>
            <div>
              <label className="field-label" htmlFor="phone">{t('auth.mobile')}</label>
              <input id="phone" type="tel" className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" autoComplete="tel" inputMode="tel" />
              <p className="mt-2 text-xs text-ink-muted">{t('auth.mobileHint')}</p>
            </div>
          </div>

          {error && <p className="mt-5 text-sm font-semibold text-red">{error}</p>}

          <div className="mt-auto pt-10">
            <p className="mb-4 flex items-start gap-2.5 text-xs leading-relaxed text-ink-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-navy" />
              {t('auth.pdpaConsent')}
            </p>
            <button className="btn-primary" disabled={!canRegister || busy} onClick={handleRequest}>
              {busy ? t('common.loading') : t('auth.getCode')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <h1 className="h-display">{t('auth.otpTitle')}</h1>
          <p className="mt-3 text-ink-muted">{t('auth.otpBody', { phone })}</p>

          {devCode && (
            <p className="chip-gold mt-5 self-start">{t('auth.otpDevNote', { code: devCode })}</p>
          )}

          <input
            className="field-input mt-8 py-5 text-center font-serif text-3xl tracking-[0.45em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="······"
            autoFocus
          />

          {error && <p className="mt-5 text-sm font-semibold text-red">{error}</p>}

          <button className="btn-primary mt-7" disabled={code.length !== 6 || busy} onClick={handleVerify}>
            {busy ? t('common.loading') : t('auth.verify')}
          </button>

          <button className="btn-quiet mt-3 !min-h-[44px] text-sm" disabled={resendIn > 0 || busy} onClick={handleRequest}>
            {resendIn > 0 ? t('auth.resendIn', { seconds: resendIn }) : t('auth.resend')}
          </button>
          <button className="btn-quiet !min-h-[44px] text-sm" onClick={() => { setStep('register'); setCode(''); setError(null); }}>
            {t('common.back')}
          </button>
        </div>
      )}
    </div>
  );
}
