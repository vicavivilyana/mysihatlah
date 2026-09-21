import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { createMedication } from './api';
import { functionErrorKey } from '@/lib/supabase';

export default function AddMedication({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [note, setNote] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [stock, setStock] = useState('30');
  const [refillAt, setRefillAt] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && times.length > 0 && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await createMedication({
        name: name.trim(),
        dose: dose.trim() || null,
        note: note.trim() || null,
        times,
        stock_left: Math.max(0, parseInt(stock, 10) || 0),
        refill_at: Math.max(0, parseInt(refillAt, 10) || 0),
      });
      onDone();
    } catch (e) {
      setError(t(functionErrorKey(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold text-navy">{t('meds.addTitle')}</h1>
        <button onClick={onCancel} aria-label={t('common.cancel')} className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-white text-navy">
          <X size={18} />
        </button>
      </div>

      <div className="mt-7 space-y-5">
        <div>
          <label className="field-label" htmlFor="med-name">{t('meds.name')}</label>
          <input id="med-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Metformin" autoFocus />
        </div>
        <div>
          <label className="field-label" htmlFor="med-dose">{t('meds.dose')}</label>
          <input id="med-dose" className="field-input" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="500mg" />
        </div>
        <div>
          <label className="field-label" htmlFor="med-note">{t('meds.note')}</label>
          <input id="med-note" className="field-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('meds.notePlaceholder')} />
        </div>

        <div>
          <label className="field-label">{t('meds.times')}</label>
          <div className="space-y-2">
            {times.map((tm, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  className="field-input"
                  value={tm}
                  onChange={(e) => setTimes((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {times.length > 1 && (
                  <button
                    onClick={() => setTimes((arr) => arr.filter((_, j) => j !== i))}
                    aria-label={t('common.delete')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red/10 text-red"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setTimes((arr) => [...arr, '20:00'])}
            className="mt-2 flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-navy"
          >
            <Plus size={16} /> {t('meds.addTime')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="med-stock">{t('meds.stock')}</label>
            <input id="med-stock" type="number" inputMode="numeric" min={0} className="field-input" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="med-refill">{t('meds.refillAt')}</label>
            <input id="med-refill" type="number" inputMode="numeric" min={0} className="field-input" value={refillAt} onChange={(e) => setRefillAt(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <p className="mt-5 text-sm font-semibold text-red">{error}</p>}

      <button className="btn-primary mt-8" disabled={!canSave} onClick={save}>
        {saving ? t('common.loading') : t('common.save')}
      </button>
    </div>
  );
}
