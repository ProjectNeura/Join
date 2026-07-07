ALTER TABLE applications ADD COLUMN lookup_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_lookup_code
ON applications(lookup_code);
