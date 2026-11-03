-- Up Migration

ALTER TABLE shows ADD COLUMN date_added TIMESTAMP NOT NULL;

-- Down Migration

ALTER TABLE shows DROP COLUMN date_added;