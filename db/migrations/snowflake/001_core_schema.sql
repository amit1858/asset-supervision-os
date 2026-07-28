-- ===========================================================================
-- Asset Supervision OS — Core schema (Snowflake-compatible)
-- Migration 001. Phase 2 target: implement the Repository interface against
-- these tables. Types are chosen for Snowflake (NUMBER/FLOAT/VARCHAR/BOOLEAN/
-- TIMESTAMP_NTZ/VARIANT). Field names mirror src/domain/types.ts.
--
-- All data loaded here is SYNTHETIC demonstration data. No real company,
-- plant, or product data must be loaded into this schema.
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS CORE;
USE SCHEMA CORE;

-- --- Site & hierarchy ------------------------------------------------------
CREATE OR REPLACE TABLE plants (
  id            VARCHAR PRIMARY KEY,
  code          VARCHAR NOT NULL,
  name          VARCHAR NOT NULL,
  region        VARCHAR,
  timezone      VARCHAR,
  synthetic     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE OR REPLACE TABLE production_lines (
  id                        VARCHAR PRIMARY KEY,
  plant_id                  VARCHAR NOT NULL REFERENCES plants(id),
  code                      VARCHAR NOT NULL,
  name                      VARCHAR NOT NULL,
  product                   VARCHAR,
  design_rate_units_per_hour NUMBER(12,2),
  unit                      VARCHAR
);

CREATE OR REPLACE TABLE asset_hierarchy (
  id         VARCHAR PRIMARY KEY,
  plant_id   VARCHAR NOT NULL REFERENCES plants(id),
  parent_id  VARCHAR,
  level      VARCHAR NOT NULL,      -- site | area | unit | equipment_group
  code       VARCHAR NOT NULL,
  name       VARCHAR NOT NULL
);

CREATE OR REPLACE TABLE assets (
  id                  VARCHAR PRIMARY KEY,
  tag                 VARCHAR NOT NULL,     -- equipment id, e.g. K-201
  name                VARCHAR NOT NULL,
  plant_id            VARCHAR NOT NULL REFERENCES plants(id),
  production_line_id  VARCHAR REFERENCES production_lines(id),
  hierarchy_node_id   VARCHAR REFERENCES asset_hierarchy(id),
  asset_type          VARCHAR,
  manufacturer        VARCHAR,
  model               VARCHAR,
  criticality         VARCHAR NOT NULL,     -- A | B | C | D | E
  operational_status  VARCHAR NOT NULL,
  commissioned_on     TIMESTAMP_NTZ,
  synthetic           BOOLEAN NOT NULL DEFAULT TRUE
);

-- --- Sensor & condition ----------------------------------------------------
CREATE OR REPLACE TABLE sensor_readings (
  sensor_id   VARCHAR NOT NULL,
  asset_id    VARCHAR NOT NULL REFERENCES assets(id),
  channel     VARCHAR NOT NULL,
  ts          TIMESTAMP_NTZ NOT NULL,
  value       FLOAT NOT NULL,
  unit        VARCHAR,
  provenance  VARCHAR             -- measured | statistical
);

CREATE OR REPLACE TABLE condition_events (
  id           VARCHAR PRIMARY KEY,
  asset_id     VARCHAR NOT NULL REFERENCES assets(id),
  detected_at  TIMESTAMP_NTZ NOT NULL,
  channel      VARCHAR,
  severity     VARCHAR NOT NULL,   -- info | low | medium | high | critical
  rule         VARCHAR,
  detail       VARCHAR,
  value        FLOAT,
  threshold    FLOAT,
  provenance   VARCHAR,            -- business_rule | statistical
  acknowledged BOOLEAN DEFAULT FALSE
);

-- --- Production / OEE inputs ------------------------------------------------
CREATE OR REPLACE TABLE production_runs (
  id                         VARCHAR PRIMARY KEY,
  production_line_id         VARCHAR NOT NULL REFERENCES production_lines(id),
  asset_id                   VARCHAR REFERENCES assets(id),
  period_start               TIMESTAMP_NTZ NOT NULL,
  period_end                 TIMESTAMP_NTZ NOT NULL,
  planned_production_minutes NUMBER(10,2) NOT NULL,
  downtime_minutes           NUMBER(10,2) NOT NULL,
  ideal_rate_units_per_hour  NUMBER(12,2) NOT NULL,
  total_units_produced       NUMBER(14,2) NOT NULL,
  good_units                 NUMBER(14,2) NOT NULL,
  unit                       VARCHAR,
  synthetic                  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE OR REPLACE TABLE downtime_events (
  id                  VARCHAR PRIMARY KEY,
  production_run_id   VARCHAR REFERENCES production_runs(id),
  production_line_id  VARCHAR REFERENCES production_lines(id),
  asset_id            VARCHAR REFERENCES assets(id),
  category            VARCHAR NOT NULL,
  started_at          TIMESTAMP_NTZ NOT NULL,
  ended_at            TIMESTAMP_NTZ NOT NULL,
  minutes             NUMBER(10,2) NOT NULL,
  description         VARCHAR,
  planned             BOOLEAN DEFAULT FALSE
);

CREATE OR REPLACE TABLE quality_events (
  id                  VARCHAR PRIMARY KEY,
  production_run_id   VARCHAR REFERENCES production_runs(id),
  production_line_id  VARCHAR REFERENCES production_lines(id),
  category            VARCHAR NOT NULL,
  occurred_at         TIMESTAMP_NTZ NOT NULL,
  defective_units     NUMBER(14,2) NOT NULL,
  description         VARCHAR
);

-- --- Maintenance & materials ----------------------------------------------
CREATE OR REPLACE TABLE work_orders (
  id                 VARCHAR PRIMARY KEY,
  number             VARCHAR NOT NULL,
  asset_id           VARCHAR NOT NULL REFERENCES assets(id),
  type               VARCHAR NOT NULL,
  status             VARCHAR NOT NULL,
  priority           VARCHAR NOT NULL,
  title              VARCHAR,
  description        VARCHAR,
  created_at         TIMESTAMP_NTZ NOT NULL,
  scheduled_start    TIMESTAMP_NTZ,
  required_spare_ids VARIANT,       -- array of spare_part ids
  estimated_cost     NUMBER(14,2),
  currency           VARCHAR
);

CREATE OR REPLACE TABLE maintenance_history (
  id                 VARCHAR PRIMARY KEY,
  asset_id           VARCHAR NOT NULL REFERENCES assets(id),
  performed_at       TIMESTAMP_NTZ NOT NULL,
  work_order_number  VARCHAR,
  activity           VARCHAR,
  findings           VARCHAR,
  technician         VARCHAR,
  labor_hours        NUMBER(8,2)
);

CREATE OR REPLACE TABLE spare_parts (
  id             VARCHAR PRIMARY KEY,
  part_number    VARCHAR NOT NULL,
  description    VARCHAR,
  category       VARCHAR,
  unit_cost      NUMBER(14,2),
  currency       VARCHAR,
  lead_time_days NUMBER(6,0),
  critical_spare BOOLEAN DEFAULT FALSE
);

CREATE OR REPLACE TABLE inventory_balances (
  id             VARCHAR PRIMARY KEY,
  spare_part_id  VARCHAR NOT NULL REFERENCES spare_parts(id),
  storeroom      VARCHAR,
  on_hand_qty    NUMBER(12,2) NOT NULL,
  reserved_qty   NUMBER(12,2) NOT NULL,
  reorder_point  NUMBER(12,2),
  updated_at     TIMESTAMP_NTZ
);

-- --- Turnaround ------------------------------------------------------------
CREATE OR REPLACE TABLE turnaround_projects (
  id                VARCHAR PRIMARY KEY,
  code              VARCHAR NOT NULL,
  name              VARCHAR NOT NULL,
  plant_id          VARCHAR NOT NULL REFERENCES plants(id),
  status            VARCHAR NOT NULL,
  window_start      TIMESTAMP_NTZ,
  window_end        TIMESTAMP_NTZ,
  scope_freeze_date TIMESTAMP_NTZ,
  budget            NUMBER(16,2),
  currency          VARCHAR,
  synthetic         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE OR REPLACE TABLE turnaround_work_packages (
  id                             VARCHAR PRIMARY KEY,
  turnaround_project_id          VARCHAR NOT NULL REFERENCES turnaround_projects(id),
  code                           VARCHAR NOT NULL,
  title                          VARCHAR,
  asset_id                       VARCHAR REFERENCES assets(id),
  discipline                     VARCHAR,
  status                         VARCHAR,
  readiness                      VARIANT,   -- {engineering,materials,labour,permits}
  planned_start                  TIMESTAMP_NTZ,
  planned_finish                 TIMESTAMP_NTZ,
  estimated_cost                 NUMBER(16,2),
  originating_condition_event_id VARCHAR,
  on_critical_path               BOOLEAN DEFAULT FALSE
);

CREATE OR REPLACE TABLE work_package_dependencies (
  id             VARCHAR PRIMARY KEY,
  predecessor_id VARCHAR NOT NULL REFERENCES turnaround_work_packages(id),
  successor_id   VARCHAR NOT NULL REFERENCES turnaround_work_packages(id),
  type           VARCHAR NOT NULL,
  lag_days       NUMBER(6,0) DEFAULT 0
);

-- --- Recommendations, evidence, decisions, outcomes ------------------------
CREATE OR REPLACE TABLE recommendations (
  id                VARCHAR PRIMARY KEY,
  asset_id          VARCHAR NOT NULL REFERENCES assets(id),
  created_at        TIMESTAMP_NTZ NOT NULL,
  title             VARCHAR,
  summary           VARCHAR,
  disposition       VARCHAR NOT NULL,
  severity          VARCHAR NOT NULL,
  confidence        FLOAT,
  ai_rationale      VARCHAR,
  ai_interaction_id VARCHAR,
  evidence_ids      VARIANT,
  estimated_value   NUMBER(16,2),
  currency          VARCHAR,
  status            VARCHAR NOT NULL
);

CREATE OR REPLACE TABLE recommendation_evidence (
  id                VARCHAR PRIMARY KEY,
  recommendation_id VARCHAR NOT NULL REFERENCES recommendations(id),
  label             VARCHAR,
  value             VARCHAR,
  provenance        VARCHAR NOT NULL,
  source_type       VARCHAR,
  source_id         VARCHAR,
  observed_at       TIMESTAMP_NTZ
);

CREATE OR REPLACE TABLE human_decisions (
  id                    VARCHAR PRIMARY KEY,
  recommendation_id     VARCHAR NOT NULL REFERENCES recommendations(id),
  decided_by            VARCHAR NOT NULL,
  role                  VARCHAR,
  decision              VARCHAR NOT NULL,  -- approved | rejected | modified | deferred
  decided_at            TIMESTAMP_NTZ NOT NULL,
  note                  VARCHAR,
  modified_disposition  VARCHAR
);

CREATE OR REPLACE TABLE operational_outcomes (
  id                VARCHAR PRIMARY KEY,
  recommendation_id VARCHAR NOT NULL REFERENCES recommendations(id),
  decision_id       VARCHAR REFERENCES human_decisions(id),
  asset_id          VARCHAR REFERENCES assets(id),
  recorded_at       TIMESTAMP_NTZ NOT NULL,
  resolved          BOOLEAN DEFAULT FALSE,
  description       VARCHAR,
  estimated_value   NUMBER(16,2),
  realised_value    NUMBER(16,2),         -- NULL until realised
  value_status      VARCHAR NOT NULL,     -- projected | validated | realised
  currency          VARCHAR
);

-- --- AI accounting (Return on Token Spend) ---------------------------------
CREATE OR REPLACE TABLE prompt_versions (
  id          VARCHAR PRIMARY KEY,
  key         VARCHAR NOT NULL,
  version     VARCHAR NOT NULL,
  use_case    VARCHAR,
  template    VARCHAR,
  created_at  TIMESTAMP_NTZ NOT NULL,
  active      BOOLEAN DEFAULT TRUE
);

CREATE OR REPLACE TABLE ai_interactions (
  id                 VARCHAR PRIMARY KEY,
  created_at         TIMESTAMP_NTZ NOT NULL,
  provider           VARCHAR NOT NULL,      -- mock | nvidia | dgxspark
  model              VARCHAR NOT NULL,
  use_case           VARCHAR,
  prompt_version_id  VARCHAR REFERENCES prompt_versions(id),
  input_tokens       NUMBER(12,0) NOT NULL,
  output_tokens      NUMBER(12,0) NOT NULL,
  estimated_cost_usd NUMBER(16,6) NOT NULL,
  latency_ms         NUMBER(12,0),
  recommendation_id  VARCHAR REFERENCES recommendations(id),
  evidence_ids       VARIANT,
  output_summary     VARCHAR
);
