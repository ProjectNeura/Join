CREATE TABLE IF NOT EXISTS application_recovery_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_recovery_codes_email_created
ON application_recovery_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_recovery_codes_email_code
ON application_recovery_codes(email, code);

INSERT OR IGNORE INTO email_templates (key, subject, body) VALUES
(
  'recovery',
  'Project Neura application code recovery',
  'Hi,

Use this verification code to retrieve your Project Neura application check-back code:

{{recovery_code}}

This verification code expires in 15 minutes.

If you did not request this email, you can ignore it.

Project Neura'
);
