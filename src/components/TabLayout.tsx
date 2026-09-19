import { NavLink, Outlet } from 'react-router-dom';
import { Home, CalendarDays, Pill, Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OfflineBanner from './OfflineBanner';

/**
 * Home · Appts · Meds · Kit — per the design mockups.
 * Profile is reached from the avatar button in the Home header (the mockups
 * show Kit, not Profile, as the fourth tab).
 */
const tabs = [
  { to: '/', key: 'home', Icon: Home, end: true },
  { to: '/appointments', key: 'appointments', Icon: CalendarDays, end: false },
  { to: '/meds', key: 'meds', Icon: Pill, end: false },
  { to: '/kit', key: 'kit', Icon: Gift, end: false },
] as const;

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-sand">
      <OfflineBanner />
      <main className="flex-1 overflow-y-auto pb-28">
        <Outlet />
      </main>
      <nav className="tabbar safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md">
        <div className="grid grid-cols-4">
          {tabs.map(({ to, key, Icon, end }) => (
            <NavLink
              key={key}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition duration-200 ease-soft ${
                  isActive ? 'text-navy' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 1.7} />
                  {t(`nav.${key}`)}
                  <span
                    aria-hidden
                    className={`h-1 w-1 rounded-full transition ${isActive ? 'bg-gold' : 'bg-transparent'}`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
