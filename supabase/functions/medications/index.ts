// medications: CRUD + dose ticking for the medication tracker.
//
// One function with an `action` switch (rather than four separate functions)
// because these operations share the same encrypt/decrypt and ownership logic.
// Sensitive free text (name, dose, note) is AES-256-GCM encrypted here, exactly
// as appointments are — the database never sees plaintext.
import { serve, readJson } from '../_shared/serve.ts';
import { adminClient, getUserId, writeAudit } from '../_shared/supabaseAdmin.ts';
import { encryptField, decryptField } from '../_shared/crypto.ts';
import { logError } from '../_shared/log.ts';

const FN = 'medications';

interface Body {
  action?: 'list' | 'create' | 'delete' | 'toggle';
  // create
  name?: string;
  dose?: string | null;
  note?: string | null;
  times?: string[];
  stock_left?: number;
  refill_at?: number;
  // delete / toggle
  id?: string;
  due_date?: string;
  due_time?: string;
  taken?: boolean;
}

/** Local YYYY-MM-DD for the caller's day (they send it; default to UTC today). */
function today(d?: string): string {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
}

serve(FN, async (req, res) => {
  const userId = await getUserId(req, FN);
  if (!userId) return res.error('unauthorized', 401);

  const body = await readJson<Body>(req);
  const admin = adminClient(FN);
  const action = body.action ?? 'list';

  // ---- create -------------------------------------------------------------
  if (action === 'create') {
    if (!body.name?.trim()) return res.error('missing_fields', 400);
    const times = (body.times ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (!times.length) return res.error('missing_fields', 400);

    const { data, error } = await admin
      .from('medications')
      .insert({
        user_id: userId,
        name: await encryptField(body.name.trim(), FN),
        dose: await encryptField(body.dose ?? null, FN),
        note: await encryptField(body.note ?? null, FN),
        times,
        stock_left: Math.max(0, Number(body.stock_left ?? 0)),
        refill_at: Math.max(0, Number(body.refill_at ?? 5)),
      })
      .select('id')
      .single();
    if (error) {
      logError(FN, 'insert medications', error);
      return res.error('server_error', 500);
    }
    await writeAudit(admin, FN, userId, 'medication_added', 'medications', data.id);
    return res.json({ ok: true, id: data.id });
  }

  // ---- delete -------------------------------------------------------------
  if (action === 'delete') {
    if (!body.id) return res.error('missing_fields', 400);
    const { error } = await admin.from('medications').delete().eq('id', body.id).eq('user_id', userId);
    if (error) {
      logError(FN, 'delete medications', error);
      return res.error('server_error', 500);
    }
    await writeAudit(admin, FN, userId, 'medication_deleted', 'medications', body.id);
    return res.json({ ok: true });
  }

  // ---- toggle a dose ------------------------------------------------------
  if (action === 'toggle') {
    if (!body.id || !body.due_time) return res.error('missing_fields', 400);
    const { data, error } = await admin.rpc('toggle_medication_dose', {
      p_user_id: userId,
      p_medication_id: body.id,
      p_due_date: today(body.due_date),
      p_due_time: body.due_time,
      p_taken: body.taken === true,
    });
    if (error) {
      if (/not_found/.test(error.message ?? '')) return res.error('not_found', 404);
      logError(FN, 'rpc toggle_medication_dose', error);
      return res.error('server_error', 500);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return res.json({ ok: true, taken: row?.taken ?? false, stock_left: row?.stock_left ?? 0 });
  }

  // ---- list (default) -----------------------------------------------------
  const day = today(body.due_date);
  const [medsRes, dosesRes] = await Promise.all([
    admin.from('medications').select('*').eq('user_id', userId).eq('active', true).order('created_at'),
    admin.from('medication_doses').select('medication_id, due_time, taken_at').eq('user_id', userId).eq('due_date', day),
  ]);
  if (medsRes.error || dosesRes.error) {
    logError(FN, 'select medications/doses', medsRes.error ?? dosesRes.error);
    return res.error('server_error', 500);
  }

  const takenSet = new Set(
    (dosesRes.data ?? []).filter((d) => d.taken_at).map((d) => `${d.medication_id}|${d.due_time}`),
  );

  const medications = [];
  let totalDoses = 0;
  let takenDoses = 0;
  for (const m of medsRes.data ?? []) {
    const times: string[] = m.times ?? [];
    totalDoses += times.length;
    takenDoses += times.filter((t) => takenSet.has(`${m.id}|${t}`)).length;
    medications.push({
      id: m.id,
      name: (await decryptField(m.name, FN)) ?? '',
      dose: await decryptField(m.dose, FN),
      note: await decryptField(m.note, FN),
      times,
      stock_left: m.stock_left,
      refill_at: m.refill_at,
      // "when finish" / "when to order"
      finished: m.stock_left <= 0,
      needs_refill: m.stock_left <= m.refill_at,
      doses: times.map((t) => ({ time: t, taken: takenSet.has(`${m.id}|${t}`) })),
    });
  }

  return res.json({
    date: day,
    adherence: { taken: takenDoses, total: totalDoses },
    medications,
  });
});
