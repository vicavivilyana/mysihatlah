import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Images, Loader2, PencilLine } from 'lucide-react';
import { getOcrProvider, parseAppointment, type ParsedAppointment } from '@/providers/ocr';
import { saveAppointment, type Appointment } from './api';
import { scheduleReminders } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { functionErrorKey } from '@/lib/supabase';

type Phase = 'capture' | 'ocr' | 'review';

export default function AddAppointment({
  onSaved,
  onCancel,
}: {
  onSaved: (a: Appointment) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('capture');
  const [progress, setProgress] = useState(0);
  const [ocrOk, setOcrOk] = useState<boolean | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review fields
  const [clinic, setClinic] = useState('');
  const [followup, setFollowup] = useState(''); // datetime-local value
  const [pickup, setPickup] = useState(''); // date value
  const [ref, setRef] = useState('');
  const [rawText, setRawText] = useState('');

  async function handleFile(file: File) {
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setPhase('ocr');
    setProgress(0);
    setError(null);
    try {
      const { text } = await getOcrProvider().recognize(file, (p) => setProgress(p.progress));
      const parsed: ParsedAppointment = parseAppointment(text);
      applyParsed(parsed);
      setOcrOk(Boolean(parsed.followupAt || parsed.pickupAt));
      setRawText(text);
    } catch {
      setOcrOk(false);
    } finally {
      setPhase('review');
    }
  }

  function applyParsed(p: ParsedAppointment) {
    if (p.clinicName) setClinic(p.clinicName);
    if (p.followupAt) setFollowup(p.followupAt.slice(0, 16)); // YYYY-MM-DDTHH:MM
    if (p.pickupAt) setPickup(p.pickupAt);
    if (p.referenceNo) setRef(p.referenceNo);
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveAppointment(
        session.user.id,
        {
          clinic_name: clinic.trim(),
          followup_at: followup ? new Date(followup).toISOString() : null,
          pickup_at: pickup || null,
          reference_no: ref.trim() || null,
          raw_ocr_text: rawText || undefined,
        },
        image,
      );

      // Schedule local reminders for whichever dates exist.
      const targets: Date[] = [];
      if (followup) targets.push(new Date(followup));
      if (pickup) targets.push(new Date(`${pickup}T08:00`));
      if (targets.length) {
        await scheduleReminders(saved.id, t('appointments.title'), clinic || t('appointments.title'), targets);
      }

      onSaved(saved);
    } catch (e) {
      setError(t(functionErrorKey(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {phase === 'capture' && (
        <div className="space-y-4">
          <button className="btn-primary flex items-center justify-center gap-2" onClick={() => cameraRef.current?.click()}>
            <Camera size={18} /> {t('appointments.capture')}
          </button>
          <button className="btn-ghost flex items-center justify-center gap-2" onClick={() => galleryRef.current?.click()}>
            <Images size={18} /> {t('appointments.chooseImage')}
          </button>
          {/* Manual path — same review-before-save screen, just nothing pre-filled. */}
          <button
            className="btn-ghost flex items-center justify-center gap-2"
            onClick={() => { setOcrOk(null); setPhase('review'); }}
          >
            <PencilLine size={18} /> {t('appointments.manual')}
          </button>
          <button className="w-full py-2 text-sm text-ink-muted" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      )}

      {phase === 'ocr' && (
        <div className="flex flex-col items-center py-16 text-center">
          <Loader2 className="animate-spin text-navy" size={36} />
          <p className="mt-4 font-medium text-ink">{t('appointments.ocrRunning')}</p>
          <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-navy/5">
            <div className="h-full bg-navy transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-4">
          {ocrOk !== null && (
            <p className={`rounded-2xl px-4 py-2 text-sm font-medium ${ocrOk ? 'bg-navy/5 text-navy' : 'bg-red-wash text-red'}`}>
              {ocrOk ? t('appointments.ocrDone') : t('appointments.ocrFailed')}
            </p>
          )}

          {preview && <img src={preview} alt="card" className="max-h-40 w-full rounded-card object-cover" />}

          <div>
            <label className="field-label">{t('appointments.clinicName')}</label>
            <input className="field-input" value={clinic} onChange={(e) => setClinic(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('appointments.followupAt')}</label>
            <input type="datetime-local" className="field-input" value={followup} onChange={(e) => setFollowup(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('appointments.pickupAt')}</label>
            <input type="date" className="field-input" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('appointments.referenceNo')}</label>
            <input className="field-input" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>

          <p className="text-xs text-ink-muted">{t('appointments.reminderNote')}</p>
          {error && <p className="text-sm font-medium text-red">{error}</p>}

          <button className="btn-primary" disabled={saving || (!followup && !pickup) || !clinic.trim()} onClick={handleSave}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
          <button className="w-full py-2 text-sm text-ink-muted" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      )}
    </div>
  );
}
