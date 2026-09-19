import { supabase, invokeFunction } from '@/lib/supabase';

export interface AppointmentInput {
  clinic_name: string;
  followup_at: string | null; // ISO datetime or null
  pickup_at: string | null; // ISO date or null
  reference_no: string | null;
  raw_ocr_text?: string;
}

export interface Appointment extends AppointmentInput {
  id: string;
  image_path: string | null;
  image_url?: string | null; // signed, short-lived
  created_at: string;
}

const BUCKET = 'appointment-cards';

/** Upload the card image to the PRIVATE bucket under the user's own folder. */
async function uploadImage(userId: string, file: Blob): Promise<string> {
  const ext = file.type.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function saveAppointment(
  userId: string,
  input: AppointmentInput,
  image?: Blob | null,
): Promise<Appointment> {
  let image_path: string | null = null;
  if (image) {
    image_path = await uploadImage(userId, image);
  }
  // The Edge Function encrypts sensitive fields (clinic_name, reference_no,
  // raw_ocr_text) with AES-256-GCM before insert, and writes an audit row.
  return invokeFunction<Appointment>('save-appointment', { ...input, image_path });
}

/** List appointments (decrypted server-side) with fresh signed image URLs. */
export async function listAppointments(): Promise<Appointment[]> {
  const res = await invokeFunction<{ appointments: Appointment[] }>('list-appointments', {});
  return res.appointments;
}

export async function deleteAppointment(appt: Appointment): Promise<void> {
  // RLS restricts deletes to the owner's own rows.
  const { error } = await supabase.from('appointments').delete().eq('id', appt.id);
  if (error) throw error;
  if (appt.image_path) {
    await supabase.storage.from(BUCKET).remove([appt.image_path]);
  }
}
