-- Up Migration

ALTER TABLE shows ADD COLUMN show_type TEXT NOT NULL;

-- Down Migration

ALTER TABLE shows DROP COLUMN show_type;
