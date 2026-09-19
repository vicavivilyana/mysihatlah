import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarClock } from 'lucide-react';
import AddAppointment from '@/features/appointments/AddAppointment';
import AppointmentCard from '@/features/appointments/AppointmentCard';
import { listAppointments, deleteAppointment, type Appointment } from '@/features/appointments/api';
import { hasSupabaseConfig } from '@/lib/supabase';

function isUpcoming(a: Appointment): boolean {
  const dates = [a.followup_at, a.pickup_at ? `${a.pickup_at}T23:59` : null].filter(Boolean) as string[];
  return dates.some((d) => new Date(d).getTime() >= Date.now());
}

export default function AppointmentsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await listAppointments());
      setError(null);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(a: Appointment) {
    if (!confirm(t('appointments.deleteConfirm'))) return;
    await deleteAppointment(a);
    setItems((prev) => prev.filter((x) => x.id !== a.id));
  }

  const upcoming = items.filter(isUpcoming);
  const past = items.filter((a) => !isUpcoming(a));

  if (adding) {
    return (
      <div className="pt-8 safe-top">
        <div className="px-5">
          <h1 className="h-display">{t('appointments.add')}</h1>
        </div>
        <AddAppointment
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 safe-top">
      <div className="flex items-center justify-between">
        <h1 className="h-display">{t('appointments.title')}</h1>
        <button onClick={() => setAdding(true)} aria-label={t('appointments.add')} className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white shadow-card active:scale-95">
          <Plus size={22} />
        </button>
      </div>

      {loading && <p className="mt-8 text-center text-ink-muted">{t('common.loading')}</p>}
      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      {!loading && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-card bg-navy/5 text-navy">
            <CalendarClock size={32} />
          </div>
          <p className="mt-4 max-w-xs text-ink-muted">{t('appointments.empty')}</p>
          <button onClick={() => setAdding(true)} className="btn-primary mt-6 max-w-xs">{t('appointments.add')}</button>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="eyebrow mb-3">{t('appointments.upcoming')}</h2>
          <div className="space-y-3">
            {upcoming.map((a) => <AppointmentCard key={a.id} appt={a} onDelete={handleDelete} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-6">
          <h2 className="eyebrow mb-3">{t('appointments.past')}</h2>
          <div className="space-y-3 opacity-70">
            {past.map((a) => <AppointmentCard key={a.id} appt={a} onDelete={handleDelete} />)}
          </div>
        </section>
      )}
    </div>
  );
}
