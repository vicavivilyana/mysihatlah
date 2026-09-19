// seed-demo: idempotently upsert a demo hospital + machines (incl. the test
// dispenser HG-TEST-000, stock 999). Not publicly callable: requires
//   header x-seed-secret: <SEED_SECRET>
// verify_jwt = false because it authenticates with its own secret.
import { serve } from '../_shared/serve.ts';
import { adminClient } from '../_shared/supabaseAdmin.ts';
import { safeEqual } from '../_shared/crypto.ts';
import { requireEnv } from '../_shared/env.ts';
import { logError } from '../_shared/log.ts';

const FN = 'seed-demo';

const HOSPITALS = [
  { id: 'kpj-dsara', name: 'KPJ Damansara Specialist Hospital', code: 'KPJDS', active: true },
  { id: 'demo-hosp', name: 'HealthGo Demo Hospital', code: 'DEMO', active: true },
];
const MACHINES = [
  { machine_id: 'HG-TEST-000', hospital_id: 'demo-hosp', location_name: 'Main Lobby (Test)', lat: 3.139, lng: 101.6869, stock_count: 999, active: true },
  { machine_id: 'HG-KPJ-014', hospital_id: 'kpj-dsara', location_name: 'Level 2 Pharmacy', lat: 3.1626, lng: 101.6299, stock_count: 50, active: true },
  { machine_id: 'HG-KPJ-021', hospital_id: 'kpj-dsara', location_name: 'Ground Floor Cafeteria', lat: 3.1628, lng: 101.6301, stock_count: 50, active: true },
];

serve(FN, async (req, res) => {
  const secret = requireEnv('SEED_SECRET', FN);
  const provided = req.headers.get('x-seed-secret') ?? '';
  if (!safeEqual(provided, secret)) return res.error('unauthorized', 401);

  const admin = adminClient(FN);

  const { error: hErr } = await admin.from('hospitals').upsert(HOSPITALS, { onConflict: 'id' });
  if (hErr) {
    logError(FN, 'upsert hospitals', hErr);
    return res.error('server_error', 500);
  }
  // Idempotent: re-running restores demo stock/location but never duplicates.
  const { error: mErr } = await admin.from('machines').upsert(MACHINES, { onConflict: 'machine_id' });
  if (mErr) {
    logError(FN, 'upsert machines', mErr);
    return res.error('server_error', 500);
  }

  return res.json({
    ok: true,
    hospitals: HOSPITALS.length,
    machines: MACHINES.length,
    test_machine: 'HG-TEST-000',
  });
});
