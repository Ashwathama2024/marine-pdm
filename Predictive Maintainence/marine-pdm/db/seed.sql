-- MarineGPT Living PDM System — Seed Data
-- 9 primary sensors start ACTIVE with physics-based baselines.
-- All others start OBSERVATION (added through SensorManager UI).
-- Run AFTER schema.sql: psql -d marine_pdm -f seed.sql

-- ── FAULT PATTERNS (3 defaults) ────────────────────────────────────────────
INSERT INTO fault_patterns (id, name, conditions, affected_tags, action_window)
VALUES
(
  'injector_degradation',
  'Injector Degradation',
  '[
    {"tag":"cylDev","metric":"deviation","operator":">","threshold":20},
    {"tag":"cylRate","metric":"rate","operator":">","threshold":0},
    {"tag":"cylImbalance","metric":"imbalance","operator":">","threshold":15},
    {"tag":"cylPersist","metric":"persistence","operator":">","threshold":4}
  ]'::jsonb,
  ARRAY['ME.Cyl1.ExhaustTemp','ME.Cyl2.ExhaustTemp','ME.Cyl3.ExhaustTemp',
        'ME.Cyl4.ExhaustTemp','ME.Cyl5.ExhaustTemp','ME.Cyl6.ExhaustTemp'],
  '4–8 hours'
),
(
  'lube_system_failure',
  'Lube System Failure',
  '[
    {"tag":"lubeDev","metric":"deviation","operator":"<","threshold":-0.4},
    {"tag":"lubeRate","metric":"rate","operator":"<","threshold":-0.05},
    {"tag":"lubePersist","metric":"persistence","operator":">","threshold":5}
  ]'::jsonb,
  ARRAY['ME.LubeOilPressure'],
  'Immediate'
),
(
  'cooling_fouling',
  'Cooling Fouling',
  '[
    {"tag":"cylsAllRising","metric":"deviation","operator":">","threshold":5},
    {"tag":"jacketDev","metric":"deviation","operator":">","threshold":5},
    {"tag":"sfocRising","metric":"deviation","operator":">","threshold":3},
    {"tag":"coolingEff","metric":"deviation","operator":"<","threshold":-0.08}
  ]'::jsonb,
  ARRAY['ME.ExhaustTemp','ME.JacketCoolingOutlet','ME.SFOC','ME.CoolingEfficiency'],
  'Next port'
)
ON CONFLICT (id) DO NOTHING;

-- ── 9 PRIMARY SENSORS (ACTIVE from day one) ───────────────────────────────
INSERT INTO sensors (id, display_name, unit, min_physical, max_physical, alarm_high, alarm_low, status, observation_days_req, added_by)
VALUES
  ('ME.RPM',                'Main Engine RPM',          'RPM',    400,  800,  750,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.Load',               'Engine Load',              '%',       10,  100,   90,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.ExhaustTemp',        'Mean Exhaust Temp',         '°C',    250,  480,  430,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.LubeOilPressure',    'Lube Oil Pressure',         'bar',   2.5,  5.5, NULL,    3.2, 'ACTIVE', 0, 'system'),
  ('ME.FuelRack',           'Fuel Rack Position',        'mm',     20,   80,   75,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.ScavengeAirPressure','Scavenge Air Pressure',     'bar',   0.5,  3.0, NULL,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.TCSpeed',            'Turbocharger Speed',        'RPM',  8000,25000, NULL,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.JacketCoolingOutlet','Jacket Cooling Water Outlet','°C',    60,   98,   90,   NULL, 'ACTIVE', 0, 'system'),
  ('ME.SFOC',               'Specific Fuel Oil Consumption','g/kWh',165,215,  NULL,  NULL, 'ACTIVE', 0, 'system')
ON CONFLICT (id) DO NOTHING;

-- ── PHYSICS-BASED BASELINES FOR 9 PRIMARY SENSORS ────────────────────────
-- source = 'MAN B&W Physics Model v1' — replace via BaselineEditor with real OEM data
INSERT INTO baseline_curves (sensor_id, equation, coefficients, depends_on, valid_load_min, valid_load_max, source)
VALUES
(
  'ME.RPM',
  'rpm',
  '{"direct": 1}'::jsonb,
  ARRAY['rpm'],
  10, 100,
  'MAN B&W Physics Model v1 — direct input'
),
(
  'ME.Load',
  'load',
  '{"direct": 1}'::jsonb,
  ARRAY['load'],
  10, 100,
  'MAN B&W Physics Model v1 — direct input'
),
(
  'ME.ExhaustTemp',
  '250 + load*1.4 + rpm/700*10 / coolingEff',
  '{"base": 250, "loadFactor": 1.4, "rpmFactor": 10, "rpmDivisor": 700}'::jsonb,
  ARRAY['load', 'rpm', 'coolingEff'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.LubeOilPressure',
  '4.2 + rpm/700*0.8 - load*0.005',
  '{"base": 4.2, "rpmFactor": 0.8, "rpmDivisor": 700, "loadFactor": 0.005}'::jsonb,
  ARRAY['load', 'rpm'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.FuelRack',
  '20 + load*0.6 + (rpm-600)*0.02',
  '{"base": 20, "loadFactor": 0.6, "rpmOffset": 600, "rpmFactor": 0.02}'::jsonb,
  ARRAY['load', 'rpm'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.ScavengeAirPressure',
  '0.8 + load/100*1.4 + rpm/700*0.3',
  '{"base": 0.8, "loadFactor": 1.4, "rpmFactor": 0.3, "rpmDivisor": 700}'::jsonb,
  ARRAY['load', 'rpm'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.TCSpeed',
  '8000 + load*80 + (rpm-600)*20',
  '{"base": 8000, "loadFactor": 80, "rpmOffset": 600, "rpmFactor": 20}'::jsonb,
  ARRAY['load', 'rpm'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.JacketCoolingOutlet',
  '(65 + load*0.28) / coolingEff',
  '{"base": 65, "loadFactor": 0.28}'::jsonb,
  ARRAY['load', 'coolingEff'],
  10, 100,
  'MAN B&W Physics Model v1'
),
(
  'ME.SFOC',
  '185 + (100-load)*0.4 + (700-rpm)*0.1 + (1-coolingEff)*20',
  '{"base": 185, "loadFactor": 0.4, "rpmOffset": 700, "rpmFactor": 0.1, "coolingFactor": 20}'::jsonb,
  ARRAY['load', 'rpm', 'coolingEff'],
  10, 100,
  'MAN B&W Physics Model v1'
)
ON CONFLICT DO NOTHING;

-- ── SENSOR DEPENDENCIES (cross-correlation for fault classification) ───────
INSERT INTO sensor_dependencies (sensor_id, depends_on_id, correlation_coefficient)
VALUES
  ('ME.ExhaustTemp',         'ME.Load',              0.96),
  ('ME.ExhaustTemp',         'ME.RPM',               0.88),
  ('ME.JacketCoolingOutlet', 'ME.Load',              0.91),
  ('ME.JacketCoolingOutlet', 'ME.ExhaustTemp',       0.85),
  ('ME.TCSpeed',             'ME.Load',              0.97),
  ('ME.TCSpeed',             'ME.RPM',               0.93),
  ('ME.SFOC',                'ME.Load',             -0.82),
  ('ME.SFOC',                'ME.JacketCoolingOutlet', 0.71),
  ('ME.LubeOilPressure',     'ME.RPM',               0.78)
ON CONFLICT (sensor_id, depends_on_id) DO NOTHING;
