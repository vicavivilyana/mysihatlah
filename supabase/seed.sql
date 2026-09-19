-- Auto-loaded by `supabase db reset` for local development.
-- Sample hospital + machines, including the test dispenser HG-TEST-000.

insert into public.hospitals (id, name, code, active) values
  ('kpj-dsara', 'KPJ Damansara Specialist Hospital', 'KPJDS', true),
  ('demo-hosp', 'HealthGo Demo Hospital', 'DEMO', true)
on conflict (id) do nothing;

insert into public.machines (machine_id, hospital_id, location_name, lat, lng, stock_count, active) values
  ('HG-TEST-000', 'demo-hosp', 'Main Lobby (Test)', 3.139, 101.6869, 999, true),
  ('HG-KPJ-014', 'kpj-dsara', 'Level 2 Pharmacy', 3.1626, 101.6299, 50, true),
  ('HG-KPJ-021', 'kpj-dsara', 'Ground Floor Cafeteria', 3.1628, 101.6301, 50, true)
on conflict (machine_id) do nothing;
