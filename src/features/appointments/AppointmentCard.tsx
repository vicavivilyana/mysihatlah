import { useTranslation } from 'react-i18next';
import { CalendarPlus, Bell, Trash2, Hash } from 'lucide-react';
import type { Appointment } from './api';
import { downloadICS, type CalendarEvent } from '@/lib/ics';
import { scheduleReminders } from '@/lib/notifications';

function fmtDateTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { dateStyle: 'medium' });
}

export default function AppointmentCard({
  appt,
  onDelete,
}: {
  appt: Appointment;
  onDelete: (a: Appointment) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-MY';

  const followupStr = fmtDateTime(appt.followup_at, locale);
  const pickupStr = fmtDate(appt.pickup_at, locale);

  function addToCalendar() {
    const events: CalendarEvent[] = [];
    if (appt.followup_at) {
      events.push({
        uid: `${appt.id}-followup@healthgo`,
        title: `${t('appointments.followupAt')} — ${appt.clinic_name}`,
        location: appt.clinic_name,
        start: new Date(appt.followup_at),
      });
    }
    if (appt.pickup_at) {
      events.push({
        uid: `${appt.id}-pickup@healthgo`,
        title: `${t('appointments.pickupAt')} — ${appt.clinic_name}`,
        location: appt.clinic_name,
        allDayDate: new Date(`${appt.pickup_at}T00:00`),
      });
    }
    if (events.length) downloadICS(`healthgo-${appt.id.slice(0, 8)}`, events);
  }

  async function enableReminders() {
    const targets: Date[] = [];
    if (appt.followup_at) targets.push(new Date(appt.followup_at));
    if (appt.pickup_at) targets.push(new Date(`${appt.pickup_at}T08:00`));
    const { permission } = await scheduleReminders(appt.id, t('appointments.title'), appt.clinic_name, targets);
    if (permission === 'denied') alert(t('appointments.notifDenied'));
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{appt.clinic_name || '—'}</p>
          <div className="mt-2 space-y-1 text-sm">
            <p className="text-ink">
              <span className="text-ink-muted">{t('appointments.followupAt')}: </span>
              {followupStr ?? t('appointments.noFollowup')}
            </p>
            <p className="text-ink">
              <span className="text-ink-muted">{t('appointments.pickupAt')}: </span>
              {pickupStr ?? t('appointments.noPickup')}
            </p>
            {appt.reference_no && (
              <p className="flex items-center gap-1 text-ink-muted">
                <Hash size={13} /> {appt.reference_no}
              </p>
            )}
          </div>
        </div>
        {appt.image_url && (
          <img src={appt.image_url} alt="card" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={addToCalendar} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy/5 py-2 text-sm font-medium text-navy">
          <CalendarPlus size={16} /> {t('appointments.addToCalendar')}
        </button>
        <button onClick={enableReminders} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy/5 py-2 text-sm font-medium text-navy">
          <Bell size={16} /> {t('appointments.enableReminders')}
        </button>
        <button onClick={() => onDelete(appt)} aria-label={t('common.delete')} className="flex items-center justify-center rounded-xl bg-red/10 px-3 text-red">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
