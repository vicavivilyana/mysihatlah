import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pill, Trash2, ShoppingCart, AlertCircle } from 'lucide-react';
import AddMedication from '@/features/meds/AddMedication';
import { listMedications, toggleDose, deleteMedication, type MedicationsView } from '@/features/meds/api';
import { hasSupabaseConfig, functionErrorKey } from '@/lib/supabase';

/** "8" + "AM" stacked, like the design's time block. */
function timeBlock(hhmm: string): { big: string; small: string } {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { big: m === 0 ? String(h12) : `${h12}:${String(m).padStart(2, '0')}`, small: suffix };
}

export default function MedsScreen() {
  const { t } = useTranslation();
  const [view, setView] = useState<MedicationsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDose, setBusyDose] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return; }
    try {
      setView(await listMedications());
      setError(null);
    } catch (e) {
      setError(t(functionErrorKey(e)));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onToggle(medId: string, time: string, taken: boolean) {
    const key = `${medId}|${time}`;
    setBusyDose(key);
    // Optimistic flip so the tick feels instant.
    setView((v) =>
      v && {
        ...v,
        adherence: { ...v.adherence, taken: v.adherence.taken + (taken ? 1 : -1) },
        medications: v.medications.map((m) =>
          m.id === medId ? { ...m, doses: m.doses.map((d) => (d.time === time ? { ...d, taken } : d)) } : m,
        ),
      },
    );
    try {
      await toggleDose(medId, time, taken);
      await refresh();
    } catch (e) {
      setError(t(functionErrorKey(e)));
      await refresh();
    } finally {
      setBusyDose(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm(t('meds.deleteConfirm'))) return;
    try {
      await deleteMedication(id);
      await refresh();
    } catch (e) {
      setError(t(functionErrorKey(e)));
    }
  }

  if (adding) {
    return <AddMedication onDone={() => { setAdding(false); void refresh(); }} onCancel={() => setAdding(false)} />;
  }

  const adherence = view?.adherence ?? { taken: 0, total: 0 };
  const pct = adherence.total ? Math.round((adherence.taken / adherence.total) * 100) : 0;
  const refillList = (view?.medications ?? []).filter((m) => m.needs_refill);

  return (
    <div className="px-5 pb-8 pt-8 safe-top">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold text-navy">{t('meds.title')}</h1>
        <button
          onClick={() => setAdding(true)}
          aria-label={t('meds.add')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-white shadow-card transition active:scale-95"
        >
          <Plus size={20} />
        </button>
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-red">{error}</p>}
      {loading && <p className="mt-8 text-center text-ink-muted">{t('common.loading')}</p>}

      {!loading && view && (
        <>
          {/* Adherence */}
          <div className="card mt-6">
            <p className="text-center">
              <span className="text-[34px] font-bold leading-none text-navy">{adherence.taken}</span>
              <span className="text-lg font-semibold text-ink-muted"> / {adherence.total}</span>
            </p>
            <p className="mt-1 text-center text-sm text-ink-muted">
              {t('meds.dosesToday', { taken: adherence.taken, total: adherence.total })}
            </p>
            <p className="mt-2 text-center text-sm text-ink-muted">
              {adherence.total > 0 && pct >= 75 ? t('meds.consistency') : t('meds.keepGoing')}
            </p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full bg-gold transition-all duration-500 ease-soft" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Reorder prompts */}
          {refillList.map((m) => (
            <div
              key={`refill-${m.id}`}
              className={`mt-4 flex items-start gap-3 rounded-card border p-4 ${
                m.finished ? 'border-red/25 bg-red-wash' : 'border-gold/30 bg-gold-wash'
              }`}
            >
              {m.finished ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-red" /> : <ShoppingCart size={18} className="mt-0.5 shrink-0 text-gold" />}
              <div className="min-w-0">
                <p className={`text-sm font-bold ${m.finished ? 'text-red' : 'text-gold'}`}>
                  {m.finished ? t('meds.finished') : t('meds.needsRefill')}
                </p>
                <p className="mt-0.5 text-sm text-ink">
                  {m.name} · {t('meds.left', { n: m.stock_left })}
                </p>
              </div>
            </div>
          ))}

          {/* Today's schedule */}
          <h2 className="eyebrow mb-3 mt-8">{t('meds.todaySchedule')}</h2>
          {view.medications.length === 0 ? (
            <div className="card flex flex-col items-center py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-card bg-tile-gold text-navy">
                <Pill size={26} />
              </span>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-muted">{t('meds.empty')}</p>
              <button className="btn-primary mt-6 max-w-xs" onClick={() => setAdding(true)}>{t('meds.add')}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {view.medications.flatMap((m) =>
                m.doses.map((d) => {
                  const tb = timeBlock(d.time);
                  const key = `${m.id}|${d.time}`;
                  return (
                    <div key={key} className="card flex items-center gap-3 !py-3.5">
                      <div className="w-11 shrink-0 text-center">
                        <p className="text-lg font-bold leading-none text-navy">{tb.big}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-ink-muted">{tb.small}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink">
                          {m.name}{m.dose ? ` ${m.dose}` : ''}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {[m.note, t('meds.left', { n: m.stock_left })].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <button
                        onClick={() => onToggle(m.id, d.time, !d.taken)}
                        disabled={busyDose === key}
                        aria-pressed={d.taken}
                        aria-label={`${m.name} ${d.time}`}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition duration-200 ease-soft ${
                          d.taken ? 'border-success bg-success' : 'border-hairline bg-white'
                        }`}
                      >
                        {d.taken && <span className="text-sm font-bold text-white">✓</span>}
                      </button>
                      <button onClick={() => onDelete(m.id)} aria-label={t('common.delete')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                }),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
