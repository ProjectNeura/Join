CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_email_unique
ON applications(job_id, lower(trim(email)));
