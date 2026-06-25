-- MarineGPT Living PDM System — Database Schema
-- Requires: PostgreSQL with TimescaleDB extension
-- Run: psql -d marine_pdm -f schema.sql

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ── TIME-SERIES: RAW READINGS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS readings (
  time        TIMESTAMPTZ     NOT NULL,
  sensor_id   TEXT            NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  quality     SMALLINT        DEFAULT 100  -- 0–100 data quality score
);
SELECT create_hypertable('readings', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings (sensor_id, time DESC);

-- ── TIME-SERIES: COMPUTED FEATURES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS features (
  time        TIMESTAMPTZ     NOT NULL,
  sensor_id   TEXT            NOT NULL,
  deviation   DOUBLE PRECISION,
  rate        DOUBLE PRECISION,
  rolling_avg DOUBLE PRECISION,
  std_dev     DOUBLE PRECISION
);
SELECT create_hypertable('features', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_features_sensor ON features (sensor_id, time DESC);

-- ── TIME-SERIES: DECISION OUTPUTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  time        TIMESTAMPTZ     NOT NULL,
  system_risk SMALLINT,
  status      TEXT,
  alert_count SMALLINT
);
SELECT create_hypertable('decisions', 'time', if_not_exists => TRUE);

-- ── CONFIGURATION: SENSOR REGISTRY ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensors (
  id                      TEXT PRIMARY KEY,
  display_name            TEXT            NOT NULL,
  unit                    TEXT            NOT NULL,
  min_physical            DOUBLE PRECISION,
  max_physical            DOUBLE PRECISION,
  alarm_high              DOUBLE PRECISION,
  alarm_low               DOUBLE PRECISION,
  status                  TEXT            DEFAULT 'OBSERVATION'
                          CHECK (status IN ('OBSERVATION', 'ACTIVE', 'DISABLED', 'FAULT_SUSPECT')),
  observation_start_date  DATE,
  observation_days_req    INTEGER         DEFAULT 30,
  baseline_source         TEXT,
  added_by                TEXT            NOT NULL DEFAULT 'system',
  added_date              TIMESTAMPTZ     DEFAULT NOW()
);

-- ── CONFIGURATION: BASELINE CURVES (versioned — never delete) ─────────────
CREATE TABLE IF NOT EXISTS baseline_curves (
  id              SERIAL PRIMARY KEY,
  sensor_id       TEXT            REFERENCES sensors(id) ON DELETE RESTRICT,
  equation        TEXT            NOT NULL,
  coefficients    JSONB           NOT NULL,
  depends_on      TEXT[],
  valid_load_min  DOUBLE PRECISION DEFAULT 10,
  valid_load_max  DOUBLE PRECISION DEFAULT 100,
  source          TEXT            NOT NULL,  -- mandatory: who/what produced this curve
  r2_score        DOUBLE PRECISION,
  is_active       BOOLEAN         DEFAULT TRUE,
  added_date      TIMESTAMPTZ     DEFAULT NOW()
);
-- Only one active curve per sensor at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_baseline_active
  ON baseline_curves (sensor_id)
  WHERE is_active = TRUE;

-- ── CONFIGURATION: FAULT PATTERNS WITH FEEDBACK ───────────────────────────
CREATE TABLE IF NOT EXISTS fault_patterns (
  id                  TEXT PRIMARY KEY,
  name                TEXT    NOT NULL,
  conditions          JSONB   NOT NULL,
  affected_tags       TEXT[],
  action_window       TEXT,
  times_triggered     INTEGER DEFAULT 0,
  times_confirmed     INTEGER DEFAULT 0,
  times_false_positive INTEGER DEFAULT 0,
  is_active           BOOLEAN DEFAULT TRUE
);

-- ── CONFIGURATION: SENSOR DEPENDENCIES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_dependencies (
  sensor_id               TEXT    REFERENCES sensors(id) ON DELETE CASCADE,
  depends_on_id           TEXT    REFERENCES sensors(id) ON DELETE CASCADE,
  correlation_coefficient DOUBLE PRECISION,
  PRIMARY KEY (sensor_id, depends_on_id)
);

-- ── ALERTS LOG WITH OPERATOR FEEDBACK ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id               SERIAL PRIMARY KEY,
  time             TIMESTAMPTZ DEFAULT NOW(),
  component        TEXT,
  issue            TEXT,
  risk_score       SMALLINT,
  confidence       DOUBLE PRECISION,
  fault_source     TEXT CHECK (fault_source IN ('EQUIPMENT', 'SENSOR_SUSPECT', 'ISOLATED')),
  pattern_id       TEXT REFERENCES fault_patterns(id),
  operator_feedback TEXT CHECK (operator_feedback IN ('CONFIRMED', 'FALSE_POSITIVE') OR operator_feedback IS NULL),
  feedback_time    TIMESTAMPTZ
);
