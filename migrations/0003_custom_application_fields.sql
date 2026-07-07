ALTER TABLE jobs ADD COLUMN form_fields TEXT NOT NULL DEFAULT '[]';

ALTER TABLE applications ADD COLUMN custom_answers TEXT;
