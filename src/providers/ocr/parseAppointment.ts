/**
 * Parse appointment-card OCR text into structured fields.
 * Handles Malaysian date formats: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
 * "12 Jan 2026", and Malay month names (Januari…Disember).
 *
 * We classify each detected date as a follow-up appointment or a medicine
 * pickup by the keywords near it; anything unclassified falls back to the
 * earliest date = follow-up.
 */

export interface ParsedAppointment {
  clinicName?: string;
  followupAt?: string; // ISO datetime (local) e.g. 2026-01-12T14:30
  pickupAt?: string; // ISO date e.g. 2026-01-19
  referenceNo?: string;
  rawText: string;
}

const MONTHS: Record<string, number> = {
  // English (full + abbrev)
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // Malay
  januari: 1, februari: 2, mac: 3, mei: 5, julai: 7, ogos: 8, oktober: 10, disember: 12,
};

const FOLLOWUP_KEYS = /(follow[\s-]?up|appointment|temujanji|next visit|klinik|clinic|review|ulangan)/i;
const PICKUP_KEYS = /(pick[\s-]?up|collect|medicine|medication|ubat|pharmacy|farmasi|dispensary)/i;
// A reference/registration number: 2–5 letters + optional separator + digits
// (RN-88213, MRN12345), or a long bare number. Must contain digits so a plain
// word like "Rujukan" is never mistaken for the value.
const REF_TOKEN = /\b([A-Z]{2,5}[-/]?\d{3,}|MRN\s?\d{3,}|\d{6,})\b/;

interface FoundDate {
  iso: string; // YYYY-MM-DD
  time?: string; // HH:MM
  index: number; // position in text
}

function two(n: number): string {
  return n.toString().padStart(2, '0');
}

function makeIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${two(m)}-${two(d)}`;
}

/** Find a time like 2:30 PM / 14:30 near a given index. */
function findTimeNear(text: string, index: number): string | undefined {
  const window = text.slice(Math.max(0, index - 20), index + 40);
  const m = window.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23) return undefined;
  return `${two(h)}:${min}`;
}

function extractDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];

  // Numeric: DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY
  const numRe = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;
  for (let m; (m = numRe.exec(text)); ) {
    const iso = makeIso(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
    if (iso) found.push({ iso, time: findTimeNear(text, m.index), index: m.index });
  }

  // Textual: "12 Jan 2026" / "12 Januari 2026" / "12hb Mac 2026"
  const txtRe = /\b(\d{1,2})\s*(?:hb)?\s*([A-Za-z]{3,12})\.?\s*(\d{4})\b/g;
  for (let m; (m = txtRe.exec(text)); ) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) continue;
    const iso = makeIso(parseInt(m[3], 10), month, parseInt(m[1], 10));
    if (iso) found.push({ iso, time: findTimeNear(text, m.index), index: m.index });
  }

  // De-dupe by iso, keep earliest occurrence.
  const byIso = new Map<string, FoundDate>();
  for (const f of found.sort((a, b) => a.index - b.index)) {
    if (!byIso.has(f.iso)) byIso.set(f.iso, f);
  }
  return [...byIso.values()];
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  let end = text.indexOf('\n', index);
  if (end === -1) end = text.length;
  return text.slice(start, end);
}

function classify(text: string, d: FoundDate): 'followup' | 'pickup' | 'unknown' {
  // Classify by the keywords on the date's OWN line so adjacent lines don't
  // bleed into each other.
  const line = lineAt(text, d.index);
  if (PICKUP_KEYS.test(line)) return 'pickup';
  if (FOLLOWUP_KEYS.test(line)) return 'followup';
  return 'unknown';
}

function guessClinic(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // A line mentioning hospital/clinic/klinik is the strongest signal.
  const hit = lines.find((l) => /(hospital|klinik|clinic|pusat|medical|specialist|kpj|columbia|gleneagles|pantai)/i.test(l));
  if (hit) return hit.replace(/\s{2,}/g, ' ').slice(0, 120);
  // Fallback: first reasonably long line.
  return lines.find((l) => l.length >= 6 && l.length <= 60);
}

export function parseAppointment(rawText: string): ParsedAppointment {
  const text = rawText.replace(/\r/g, '');
  const dates = extractDates(text);

  let followup: FoundDate | undefined;
  let pickup: FoundDate | undefined;
  const unknown: FoundDate[] = [];

  for (const d of dates) {
    const kind = classify(text, d);
    if (kind === 'followup' && !followup) followup = d;
    else if (kind === 'pickup' && !pickup) pickup = d;
    else unknown.push(d);
  }

  // Fallbacks: assign remaining dates by chronology.
  const remaining = unknown.sort((a, b) => a.iso.localeCompare(b.iso));
  if (!followup && remaining.length) followup = remaining.shift();
  if (!pickup && remaining.length) pickup = remaining.shift();

  const refMatch = text.match(REF_TOKEN);

  return {
    clinicName: guessClinic(text),
    followupAt: followup ? `${followup.iso}T${followup.time ?? '09:00'}` : undefined,
    pickupAt: pickup?.iso,
    referenceNo: refMatch?.[1]?.replace(/\s+/g, ' ').trim(),
    rawText,
  };
}
