DELETE FROM applications
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY job_id, lower(trim(email))
        ORDER BY created_at DESC, id DESC
      ) AS duplicate_rank
    FROM applications
  )
  WHERE duplicate_rank = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_email_unique
ON applications(job_id, lower(trim(email)));
