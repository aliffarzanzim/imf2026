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
  role                 TEXT    DEFAULT 'PARTICIPANT', -- 'PARTICIPANT' or 'ORGANISER'
  verify_sig           TEXT,   -- Cryptographic badge verification signature
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Abstracts Table
CREATE TABLE IF NOT EXISTS abstracts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  abstract_number       TEXT    UNIQUE NOT NULL,
  reg_number            TEXT,   -- Linked registration number e.g. 'IMF-REG-0001'
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
CREATE INDEX IF NOT EXISTS idx_reg_email      ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_reg_phone      ON registrations(phone);
CREATE INDEX IF NOT EXISTS idx_reg_batch      ON registrations(batch);
CREATE INDEX IF NOT EXISTS idx_reg_role       ON registrations(role);
CREATE INDEX IF NOT EXISTS idx_reg_verify_sig ON registrations(verify_sig);
CREATE INDEX IF NOT EXISTS idx_abs_reg_number ON abstracts(reg_number);
CREATE INDEX IF NOT EXISTS idx_abs_email      ON abstracts(email);
CREATE INDEX IF NOT EXISTS idx_abs_phone      ON abstracts(phone);
CREATE INDEX IF NOT EXISTS idx_abs_batch      ON abstracts(batch);

-- OTPs Table for Self-Service Portal Access
CREATE TABLE IF NOT EXISTS otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number  TEXT NOT NULL,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_otps_reg ON otps(reg_number);

-- System Configuration & Access Control
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO system_config (key, value) VALUES ('registration_open', 'true');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('abstract_edit_open', 'true');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('registration_abstract_only', 'false');

-- Career Counselling Q&A Table
CREATE TABLE IF NOT EXISTS career_counselling_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL,
  question    TEXT    NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_career_counselling_qna_email ON career_counselling_questions(email);


