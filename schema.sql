-- ============================================================
-- Internal Medicine Festival 2026 — D1 Schema
-- Run: npx wrangler d1 execute imf-db --file=./schema.sql
-- ============================================================

-- Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number           TEXT    UNIQUE NOT NULL,
  full_name            TEXT    NOT NULL,
  institution          TEXT    NOT NULL,
  batch                TEXT    NOT NULL,
  academic_year        TEXT    NOT NULL,
  phone                TEXT    NOT NULL,
  email                TEXT    NOT NULL,
  activities           TEXT,   -- JSON array string e.g. '["Quiz Competition","Olympiad"]'
  competition_category TEXT,
  prior_experience     TEXT,
  queries              TEXT,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Abstracts Table
CREATE TABLE IF NOT EXISTS abstracts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  abstract_number       TEXT    UNIQUE NOT NULL,
  full_name             TEXT    NOT NULL,
  institution           TEXT    NOT NULL,
  batch                 TEXT    NOT NULL,
  academic_year         TEXT    NOT NULL,
  phone                 TEXT    NOT NULL,
  email                 TEXT    NOT NULL,
  title                 TEXT    NOT NULL,
  submission_type       TEXT    NOT NULL,
  presentation_category TEXT    NOT NULL,
  abstract_body         TEXT    NOT NULL,
  keywords              TEXT,
  presenter_name        TEXT    NOT NULL,
  co_authors            TEXT,
  author_affiliation    TEXT,
  supervisor_name       TEXT,
  r2_file_key           TEXT    NOT NULL,
  file_name             TEXT    NOT NULL,
  file_size             INTEGER NOT NULL,
  presentation_file_key TEXT,
  presentation_file_name TEXT,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_reg_email   ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_reg_batch   ON registrations(batch);
CREATE INDEX IF NOT EXISTS idx_abs_email   ON abstracts(email);
CREATE INDEX IF NOT EXISTS idx_abs_batch   ON abstracts(batch);
