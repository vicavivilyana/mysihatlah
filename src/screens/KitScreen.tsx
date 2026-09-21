import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PartyPopper, Ban, Package } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';
import SurveyForm from '@/features/kit/SurveyForm';
import ReleaseQr from '@/features/kit/ReleaseQr';
import {
  claimKit,
  getClaimStatus,
  getMyClaim,
  reissueReleaseToken,
  viewFromClaimResult,
  viewFromRow,
  type ReleaseView,
  type SurveyAnswers,
} from '@/features/kit/api';
import { functionErrorKey, isReason } from '@/lib/supabase';

type Step = 'checking' | 'survey' | 'qr' | 'claimed' | 'dispensed';

const KIT_ITEMS = ['mask', 'wetTissue', 'dryTissue', 'sanitizer', 'powerBank'] as const;
const POLL_MS = 3000;

/**
 * Claim flow: survey → claim-kit → display a QR the MACHINE scans.
 * No camera anywhere in this screen (the appointment feature still uses one).
 *
 * While the QR is on screen we poll our own kit_claims row (RLS-scoped). The
 * machine's scan redeems the token via dispenser-release, which flips the row
 * to 'released' — so the screen turns itself into "Kit dispensed 🎉".
 */
export default function KitScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('checking');
  const [claim, setClaim] = useState<ReleaseView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Decide the entry point from the user's existing claim, if any.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const row = await getMyClaim();
        if (!active) return;
        if (!row) {
          setStep('survey');
        } else if (row.status === 'released') {
          setStep('dispensed');
        } else {
          // Kit allocated but not dispensed. Re-display the EXISTING token if it
          // is still valid — opening this tab must not rotate the token (that
          // both invalidated the shown QR and wrote an audit row every visit).
          const view = viewFromRow(row);
          if (view) {
            // Valid or expired — ReleaseQr renders the countdown or its expired
            // state, where the user can explicitly request a new code.
            setClaim(view);
            setStep('qr');
          } else {
            // No token on the row at all: nothing to re-display, so mint one.
            try {
              const res = await reissueReleaseToken();
              if (!active) return;
              setClaim(viewFromClaimResult(res));
              setStep('qr');
            } catch (e) {
              if (!active) return;
              setStep(isReason(e, 'already_claimed') ? 'dispensed' : 'claimed');
            }
          }
        }
      } catch {
        // Can't read status — let the server be the source of truth.
        if (active) setStep('survey');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Poll for redemption while the QR is displayed.
  useEffect(() => {
    if (step !== 'qr') return;
    const id = setInterval(async () => {
      try {
        const status = await getClaimStatus();
        if (status === 'released' && stepRef.current === 'qr') setStep('dispensed');
      } catch {
        /* transient — keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [step]);

  async function handleSurvey(answers: SurveyAnswers) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await claimKit(answers);
      setClaim(viewFromClaimResult(res));
      setStep('qr');
    } catch (e) {
      if (isReason(e, 'already_claimed')) setStep('dispensed');
      else setError(t(functionErrorKey(e)));
    } finally {
      setSubmitting(false);
    }
  }

  const handleRegenerate = useCallback(async () => {
    setError(null);
    setRegenerating(true);
    try {
      const res = await reissueReleaseToken();
      setClaim(viewFromClaimResult(res));
    } catch (e) {
      // Already dispensed in the meantime → show the success state instead.
      if (isReason(e, 'already_claimed')) setStep('dispensed');
      else setError(t(functionErrorKey(e)));
    } finally {
      setRegenerating(false);
    }
  }, [t]);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-sand">
      {step !== 'survey' && <ScreenHeader title={t('kit.title')} />}

      {step === 'checking' && (
        <div className="flex flex-1 items-center justify-center p-10 text-ink-muted">{t('common.loading')}</div>
      )}

      {step === 'survey' && (
        <>
          {error && <p className="px-5 pt-4 text-sm font-semibold text-red">{error}</p>}
          <SurveyForm onSubmit={handleSurvey} submitting={submitting} />
        </>
      )}

      {step === 'qr' && claim && (
        <ReleaseQr
          claim={claim}
          onDone={() => navigate('/')}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
          error={error}
        />
      )}

      {step === 'claimed' && (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-card bg-navy/5 text-navy">
            <Ban size={32} />
          </div>
          <h2 className="h-section mt-5 text-2xl">{t('kit.alreadyClaimedTitle')}</h2>
          <p className="mt-2 text-ink-muted">{t('kit.alreadyClaimedBody')}</p>
          <button className="btn-primary mt-8" onClick={() => navigate('/')}>{t('nav.home')}</button>
        </div>
      )}

      {step === 'dispensed' && (
        <div className="flex flex-1 flex-col items-center px-6 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-card bg-gold text-navy-deep shadow-raised">
            <PartyPopper size={32} />
          </div>
          <h2 className="h-section mt-5 text-2xl">{t('kit.dispensedTitle')}</h2>
          <p className="mt-2 text-ink-muted">{t('kit.dispensedBody')}</p>

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

          <button className="btn-primary mt-8" onClick={() => navigate('/')}>{t('nav.home')}</button>
        </div>
      )}
    </div>
  );
}
