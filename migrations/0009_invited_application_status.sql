DROP INDEX IF EXISTS idx_applications_job_created;
DROP INDEX IF EXISTS idx_applications_lookup_code;
DROP INDEX IF EXISTS idx_applications_job_email_unique;

CREATE TABLE applications_next (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  portfolio_url TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  resume_url TEXT NOT NULL DEFAULT '',
  work_authorization TEXT NOT NULL DEFAULT '',
  cover_letter TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'under_review' CHECK (status IN ('under_review', 'invited', 'admitted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lookup_code TEXT,
  custom_answers TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

INSERT INTO applications_next (
  id, job_id, full_name, email, phone, location, portfolio_url, linkedin_url,
  resume_url, work_authorization, cover_letter, status, created_at, lookup_code, custom_answers
)
SELECT
  id,
  job_id,
  full_name,
  email,
  phone,
  location,
  portfolio_url,
  linkedin_url,
  resume_url,
  work_authorization,
  cover_letter,
  CASE
    WHEN status = 'invited' THEN 'invited'
    WHEN status = 'admitted' THEN 'admitted'
    WHEN status = 'rejected' THEN 'rejected'
    ELSE 'under_review'
  END,
  created_at,
  lookup_code,
  custom_answers
FROM applications;

DROP TABLE applications;
ALTER TABLE applications_next RENAME TO applications;

CREATE INDEX IF NOT EXISTS idx_applications_job_created ON applications(job_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_lookup_code ON applications(lookup_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_email_unique
ON applications(job_id, lower(trim(email)));

INSERT OR IGNORE INTO email_templates (key, subject, body) VALUES
(
  'invited',
  'Project Neura interview invitation',
  'Hi {{full_name}},

Thank you for applying to {{job_title}}. We would like to invite you to interview with Project Neura.

Project Neura staff will follow up shortly with scheduling details.

Project Neura'
);
