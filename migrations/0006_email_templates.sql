CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO email_templates (key, subject, body) VALUES
(
  'confirmation',
  'Project Neura application received',
  'Hi {{full_name}},

Thanks for applying to {{job_title}}. We received your application.

Your private check-back code is: {{lookup_code}}
You can retrieve your submitted application here: {{check_url}}

Keep this code somewhere safe. Project Neura staff will review your application and follow up if there is a fit.

Project Neura'
),
(
  'admitted',
  'Project Neura application update',
  'Hi {{full_name}},

Thank you for applying to {{job_title}}. We are pleased to let you know that your application has been admitted to the next stage.

Project Neura staff will follow up with next steps shortly.

Project Neura'
),
(
  'rejected',
  'Project Neura application update',
  'Hi {{full_name}},

Thank you for applying to {{job_title}}. After review, we will not be moving forward with your application for this role.

We appreciate the time and care you put into applying, and we wish you the best in your search.

Project Neura'
);
