CREATE TABLE IF NOT EXISTS members (
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
  github_url TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  mailing_address TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  account_email TEXT NOT NULL DEFAULT '',
  credentials_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_credentials_sent ON members(credentials_sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_lookup_code ON members(lookup_code);

UPDATE email_templates
SET body = 'Hi {{full_name}},

Thank you for applying to {{job_title}}. We are pleased to let you know that your application has been admitted to the next stage.

Please complete your member registration here: {{registration_url}}

Project Neura',
updated_at = CURRENT_TIMESTAMP
WHERE key = 'admitted'
  AND body = 'Hi {{full_name}},

Thank you for applying to {{job_title}}. We are pleased to let you know that your application has been admitted to the next stage.

Project Neura staff will follow up with next steps shortly.

Project Neura';

INSERT OR IGNORE INTO email_templates (key, subject, body) VALUES
(
  'account_credentials',
  'Your Project Neura email account',
  'Hi {{preferred_name}},

Your Project Neura email account has been created.

Email address: {{account_email}}
Temporary password: {{temporary_password}}

Please sign in and change this password after first use.

Project Neura'
);
