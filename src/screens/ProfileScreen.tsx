import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Download, Trash2, ShieldCheck, User as UserIcon, FileText } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';
import { useAuth } from '@/store/auth';
import { hasSupabaseConfig, functionErrorKey } from '@/lib/supabase';
import { getConsents, setConsent, exportMyData, deleteMyAccount, type ConsentState } from '@/features/profile/api';

const POLICY_VERSION = import.meta.env.VITE_POLICY_VERSION ?? '2025-01';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, session, logout } = useAuth();
  const [consents, setConsents] = useState<ConsentState>({ terms_privacy: true, marketing: false });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig || !session) return;
    getConsents(session.user.id).then(setConsents).catch(() => {});
  }, [session]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function toggleMarketing() {
    if (!session) return;
    const next = !consents.marketing;
    setConsents((c) => ({ ...c, marketing: next }));
    try {
      await setConsent(session.user.id, 'marketing', next);
      flash(next ? t('profile.granted') : t('profile.withdrawn'));
    } catch {
      setConsents((c) => ({ ...c, marketing: !next }));
    }
  }

  async function handleExport() {
    setBusy(true);
    try {
      const blob = await exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mysihatlah-my-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash(t('profile.exported'));
    } catch (e) {
      flash(t(functionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteMyAccount();
      // signOut in the API triggers AuthProvider → routes to /auth.
    } catch (e) {
      flash(t(functionErrorKey(e)));
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pt-8 safe-top">
      <h1 className="h-display">{t('profile.title')}</h1>

      {/* Account */}
      <div className="card mt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy/5 text-navy">
            <UserIcon size={24} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{profile?.name ?? '—'}</p>
            <p className="truncate text-sm text-ink-muted">{profile?.phone ?? profile?.email ?? ''}</p>
          </div>
        </div>
      </div>

      {/* Language */}
      <section className="mt-6">
        <h2 className="eyebrow mb-2">{t('profile.language')}</h2>
        <LanguageToggle />
      </section>

      {/* Consent */}
      <section className="mt-6">
        <h2 className="eyebrow mb-2">{t('profile.consents')}</h2>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-ink">
              <ShieldCheck size={16} className="text-navy" /> {t('profile.termsConsent')}
            </span>
            <span className="chip">{consents.terms_privacy ? '✓' : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">{t('profile.marketingConsent')}</span>
            <button
              onClick={toggleMarketing}
              className={`relative h-7 w-12 rounded-full transition ${consents.marketing ? 'bg-navy' : 'bg-navy/5'}`}
              aria-pressed={consents.marketing}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${consents.marketing ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <p className="text-xs text-ink-muted">{t('profile.policyVersion', { version: POLICY_VERSION })}</p>
        </div>
      </section>

      {/* Data rights */}
      <section className="mt-6">
        <h2 className="eyebrow mb-2">{t('profile.dataRights')}</h2>
        <div className="space-y-3">
          <button onClick={handleExport} disabled={busy} className="card flex w-full items-center gap-3 text-left active:scale-[0.99]">
            <Download size={20} className="text-navy" />
            <div>
              <p className="font-semibold text-ink">{t('profile.exportData')}</p>
              <p className="text-xs text-ink-muted">{t('profile.exportBody')}</p>
            </div>
          </button>

          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="card flex w-full items-center gap-3 text-left active:scale-[0.99]">
              <Trash2 size={20} className="text-red" />
              <div>
                <p className="font-semibold text-red">{t('profile.deleteAccount')}</p>
                <p className="text-xs text-ink-muted">{t('profile.deleteBody')}</p>
              </div>
            </button>
          ) : (
            <div className="card border border-red/30">
              <p className="font-semibold text-ink">{t('profile.deleteConfirmTitle')}</p>
              <p className="mt-1 text-sm text-ink-muted">{t('profile.deleteConfirmBody')}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-2xl border border-hairline bg-white py-3 font-semibold text-navy">
                  {t('common.cancel')}
                </button>
                <button onClick={handleDelete} disabled={busy} className="flex-1 rounded-2xl bg-red py-3 font-semibold text-white disabled:opacity-50">
                  {t('profile.deleteConfirmCta')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Legal links */}
      <section className="mt-6 space-y-2">
        <a href="/PRIVACY_POLICY.md" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-navy">
          <FileText size={16} /> {t('profile.privacyPolicy')}
        </a>
      </section>

      <button onClick={logout} className="btn-ghost mt-6 flex items-center justify-center gap-2 text-red">
        <LogOut size={18} /> {t('auth.logout')}
      </button>

      <p className="mb-6 mt-6 text-center text-xs text-ink-muted">{t('app.name')} · {POLICY_VERSION}</p>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-xs rounded-2xl bg-navy px-4 py-2 text-center text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
