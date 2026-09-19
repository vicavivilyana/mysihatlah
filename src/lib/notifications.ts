import { hasNotifications, hasServiceWorker } from './capabilities';

/**
 * Local reminder scheduling. Web implementation uses the Notifications API +
 * setTimeout for near-term reminders and persists the schedule in
 * localStorage so it can be re-armed on next app open. On native we swap for
 * Capacitor Local Notifications (true OS-scheduled alarms) behind this same API.
 */

const STORE_KEY = 'healthgo.reminders';

export interface ScheduledReminder {
  id: string;
  appointmentId: string;
  title: string;
  body: string;
  /** epoch ms */
  fireAt: number;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!hasNotifications()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function loadStore(): ScheduledReminder[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as ScheduledReminder[];
  } catch {
    return [];
  }
}

function saveStore(items: ScheduledReminder[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    /* private mode / quota — reminders simply won't persist */
  }
}

/** Compute reminder fire times: 1 day before + 8am on the day. */
export function computeReminderTimes(target: Date): number[] {
  const dayBefore = new Date(target.getTime() - 24 * 60 * 60 * 1000).getTime();
  const morning = new Date(target);
  morning.setHours(8, 0, 0, 0);
  return [dayBefore, morning.getTime()].filter((t) => t > Date.now());
}

export async function scheduleReminders(
  appointmentId: string,
  title: string,
  body: string,
  targets: Date[],
): Promise<{ scheduled: number; permission: NotificationPermission }> {
  const permission = await requestNotificationPermission();
  const existing = loadStore().filter((r) => r.appointmentId !== appointmentId);
  const fresh: ScheduledReminder[] = [];

  for (const target of targets) {
    for (const fireAt of computeReminderTimes(target)) {
      fresh.push({
        id: `${appointmentId}-${fireAt}`,
        appointmentId,
        title,
        body,
        fireAt,
      });
    }
  }

  saveStore([...existing, ...fresh]);
  if (permission === 'granted') armPending();
  return { scheduled: fresh.length, permission };
}

export function cancelReminders(appointmentId: string): void {
  saveStore(loadStore().filter((r) => r.appointmentId !== appointmentId));
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Arm timers for reminders due within ~24h; called on app open. */
export function armPending(): void {
  if (!hasNotifications() || Notification.permission !== 'granted') return;
  const now = Date.now();
  const horizon = 24 * 60 * 60 * 1000;
  for (const r of loadStore()) {
    if (timers.has(r.id)) continue;
    const delay = r.fireAt - now;
    if (delay <= 0 || delay > horizon) continue;
    const t = setTimeout(() => {
      void fireNotification(r.title, r.body);
      timers.delete(r.id);
      saveStore(loadStore().filter((x) => x.id !== r.id));
    }, delay);
    timers.set(r.id, t);
  }
}

async function fireNotification(title: string, body: string): Promise<void> {
  if (!hasNotifications() || Notification.permission !== 'granted') return;
  try {
    if (hasServiceWorker()) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon: '/icons/icon-192.png' });
      return;
    }
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  } catch {
    /* ignore */
  }
}
