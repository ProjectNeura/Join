DROP INDEX IF EXISTS idx_members_created;
DROP INDEX IF EXISTS idx_members_credentials_sent;
DROP INDEX IF EXISTS idx_members_lookup_code;

CREATE TABLE members_next (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  lookup_code TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  personal_email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  country_region TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT '',
  affiliation TEXT NOT NULL DEFAULT '',
  role_title TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  mailing_address TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  account_email TEXT NOT NULL DEFAULT '',
  credentials_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO members_next (
  id,
  application_id,
  lookup_code,
  job_id,
  job_title,
  full_name,
  preferred_name,
  personal_email,
  phone,
  country_region,
  timezone,
  affiliation,
  role_title,
  start_date,
  linkedin_url,
  mailing_address,
  emergency_contact,
  emergency_contact_phone,
  notes,
  account_email,
  credentials_sent_at,
  created_at,
  updated_at
)
SELECT
  id,
  application_id,
  lookup_code,
  job_id,
  job_title,
  full_name,
  preferred_name,
  personal_email,
  phone,
  country_region,
  timezone,
  affiliation,
  role_title,
  start_date,
  linkedin_url,
  mailing_address,
  emergency_contact,
  emergency_contact_phone,
  notes,
  account_email,
  credentials_sent_at,
  created_at,
  updated_at
FROM members;

DROP TABLE members;
ALTER TABLE members_next RENAME TO members;

CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_credentials_sent ON members(credentials_sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_lookup_code ON members(lookup_code);
