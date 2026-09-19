/**
 * Minimal RFC 5545 .ics generator. Web fallback for "Add to Calendar"; on
 * native we'll swap for the Capacitor Calendar plugin behind the same call.
 */

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format a Date as a UTC iCalendar timestamp: YYYYMMDDTHHMMSSZ */
function toICSDateUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Format a date-only value: YYYYMMDD (for all-day VALUE=DATE events). */
function toICSDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** Timed event start; if omitted, `allDayDate` is used as an all-day event. */
  start?: Date;
  end?: Date;
  allDayDate?: Date;
}

export function buildICS(events: CalendarEvent[]): string {
  const now = toICSDateUTC(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HealthGo//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${now}`);
    if (e.start) {
      lines.push(`DTSTART:${toICSDateUTC(e.start)}`);
      const end = e.end ?? new Date(e.start.getTime() + 30 * 60 * 1000);
      lines.push(`DTEND:${toICSDateUTC(end)}`);
    } else if (e.allDayDate) {
      lines.push(`DTSTART;VALUE=DATE:${toICSDateOnly(e.allDayDate)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    // Reminder: 1 day before.
    lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(filename: string, events: CalendarEvent[]): void {
  const ics = buildICS(events);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
