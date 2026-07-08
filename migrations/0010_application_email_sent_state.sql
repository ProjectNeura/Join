ALTER TABLE applications ADD COLUMN invitation_sent_at TEXT;
ALTER TABLE applications ADD COLUMN decision_sent_at TEXT;
ALTER TABLE applications ADD COLUMN decision_sent_status TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_invitation_sent
ON applications(invitation_sent_at);

CREATE INDEX IF NOT EXISTS idx_applications_decision_sent
ON applications(decision_sent_at);
