import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Pill, Gift, Map as MapIcon, ChevronRight, User } from 'lucide-react';
import { ROADMAP } from '@/features/registry';
import { getClaimStatus } from '@/features/kit/api';
import { listAppointments, type Appointment } from '@/features/appointments/api';
import { useAuth } from '@/store/auth';
import { hasSupabaseConfig } from '@/lib/supabase';
import { Logo, Wordmark } from '@/components/Brand';

/** Quick access, per the design: pastel tile + title + one-line description. */
const QUICK = [
  { key: 'appointments', label: 'home.label.appointments', desc: 'home.desc.appointments', Icon: CalendarDays, tile: 'bg-tile-blue', route: '/appointments' },
  { key: 'medication', label: 'home.label.medication', desc: 'home.desc.medication', Icon: Pill, tile: 'bg-tile-gold', route: '/meds' },
  { key: 'kit', label: 'home.label.kit', desc: 'home.desc.kit', Icon: Gift, tile: 'bg-tile-rose', route: '/kit' },
  { key: 'guide', label: 'home.label.guide', desc: 'home.desc.guide', Icon: MapIcon, tile: 'bg-tile-mint', route: '/coming-soon/guide', soon: true },
] as const;

function greetingKey(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'home.greetingMorning';
  if (h < 18) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

function nextUpcoming(list: Appointment[]): Appointment | null {
  const now = Date.now();
  return (
    list
      .filter((a) => a.followup_at && new Date(a.followup_at).getTime() >= now)
      .sort((a, b) => new Date(a.followup_at!).getTime() - new Date(b.followup_at!).getTime())[0] ?? null
  );
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [claimed, setClaimed] = useState(false);
  const [next, setNext] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    getClaimStatus().then((s) => setClaimed(s === 'released')).catch(() => {});
    listAppointments().then((a) => setNext(nextUpcoming(a))).catch(() => {});
  }, []);

  const locale = i18n.resolvedLanguage === 'zh' ? 'zh-CN' : i18n.resolvedLanguage === 'ms' ? 'ms-MY' : 'en-MY';
  const firstName = profile?.name?.split(' ')[0] || t('home.guest');

  return (
    <div className="min-h-full bg-sand">
      {/* ---- Navy header ---- */}
      <header className="relative overflow-hidden rounded-b-[30px] bg-navy px-5 pb-24 pt-5 safe-top">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/[0.05]" />
        <div aria-hidden className="pointer-events-none absolute right-6 top-28 h-32 w-32 rounded-full bg-white/[0.035]" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <Wordmark tone="light" className="text-lg" />
          </div>
          <button
            onClick={() => navigate('/me')}
            aria-label={t('profile.title')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
          >
            <User size={19} />
          </button>
        </div>

        <p className="relative mt-7 text-sm text-white/70">{t(greetingKey())} 👋</p>
        <h1 className="relative mt-1 text-[30px] font-bold leading-tight text-white">{firstName}</h1>
      </header>

      {/* ---- Gold hero, overlapping the header ---- */}
      <div className="relative z-10 -mt-16 px-5">
        <button
          onClick={() => navigate('/kit')}
          className="flex w-full items-center gap-4 rounded-card bg-gradient-to-br from-[#e3c25f] to-[#c49a2b] p-4 text-left shadow-raised transition duration-200 ease-soft active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-navy-deep">
            <Gift size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-snug text-navy-deep">
              {claimed ? t('home.heroClaimed') : t('home.heroTitle')}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-navy-deep/70">{t('home.heroBody')}</span>
          </span>
        </button>
      </div>

      {/* ---- Quick access ---- */}
      <section className="px-5 pt-8">
        <h2 className="text-[19px] font-bold text-navy">{t('home.quickAccess')}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3.5">
          {QUICK.map(({ key, label, desc, Icon, tile, route, ...rest }) => (
            <button
              key={key}
              onClick={() => navigate(route)}
              className="card flex min-h-[150px] flex-col items-start gap-3 !p-4 text-left transition duration-200 ease-soft active:scale-[0.98]"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tile} text-navy`}>
                <Icon size={21} />
              </span>
              <span className="mt-auto block w-full">
                <span className="block text-[15px] font-bold leading-tight text-ink">{t(label)}</span>
                <span className="mt-1 block text-xs leading-snug text-ink-muted">{t(desc)}</span>
                {'soon' in rest && rest.soon && (
                  <span className="chip-gold mt-2 !px-2 !py-0.5 !text-[10px]">{t('common.comingSoon')}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- Next appointment ---- */}
      <section className="px-5 pt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[19px] font-bold text-navy">{t('home.nextAppointment')}</h2>
          <button onClick={() => navigate('/appointments')} className="text-sm font-semibold text-gold">
            {t('home.seeAll')}
          </button>
        </div>

        {next ? (
          <button
            onClick={() => navigate('/appointments')}
            className="relative mt-4 w-full overflow-hidden rounded-card bg-navy p-5 text-left shadow-raised transition duration-200 ease-soft active:scale-[0.99]"
          >
            <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.05]" />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-gold-light">
              {next.clinic_name || t('appointments.title')}
            </p>
            <p className="relative mt-2 text-lg font-bold text-white">
              {next.reference_no ? `${next.reference_no}` : t('appointments.followupAt')}
            </p>
            <p className="relative mt-2 text-sm text-white/70">
              {new Date(next.followup_at!).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </button>
        ) : (
          <div className="card mt-4 flex items-center justify-between !py-4">
            <p className="text-sm text-ink-muted">{t('home.noUpcoming')}</p>
            <ChevronRight size={18} className="text-ink-muted" />
          </div>
        )}
      </section>

      {/* ---- Roadmap ---- */}
      <section className="px-5 pb-8 pt-8">
        <h2 className="text-[19px] font-bold text-navy">{t('comingSoon.title')}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3.5">
          {ROADMAP.filter((f) => f.key !== 'guide').map(({ key, labelKey, Icon, route }) => (
            <button
              key={key}
              onClick={() => navigate(route)}
              className="card-flat flex min-h-[104px] flex-col items-start gap-3 bg-white/60 !p-4 text-left opacity-75 transition duration-200 ease-soft active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5 text-ink-muted">
                <Icon size={18} />
              </span>
              <span className="text-[13px] font-bold leading-tight text-ink-muted">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
