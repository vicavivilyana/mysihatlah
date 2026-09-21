import { invokeFunction } from '@/lib/supabase';

export interface MedDose { time: string; taken: boolean }

export interface Medication {
  id: string;
  name: string;
  dose: string | null;
  note: string | null;
  times: string[];
  stock_left: number;
  refill_at: number;
  /** stock exhausted — "finished" */
  finished: boolean;
  /** stock at or below the reorder threshold — "time to order" */
  needs_refill: boolean;
  doses: MedDose[];
}

export interface MedicationsView {
  date: string;
  adherence: { taken: number; total: number };
  medications: Medication[];
}

/** Local calendar day, so "today" matches the user's clock, not UTC. */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function listMedications(): Promise<MedicationsView> {
  return invokeFunction<MedicationsView>('medications', { action: 'list', due_date: localToday() });
}

export function createMedication(input: {
  name: string;
  dose?: string | null;
  note?: string | null;
  times: string[];
  stock_left: number;
  refill_at: number;
}): Promise<{ ok: true; id: string }> {
  return invokeFunction('medications', { action: 'create', ...input });
}

export function deleteMedication(id: string): Promise<{ ok: true }> {
  return invokeFunction('medications', { action: 'delete', id });
}

export function toggleDose(
  id: string,
  due_time: string,
  taken: boolean,
): Promise<{ ok: true; taken: boolean; stock_left: number }> {
  return invokeFunction('medications', {
    action: 'toggle',
    id,
    due_time,
    taken,
    due_date: localToday(),
  });
}
