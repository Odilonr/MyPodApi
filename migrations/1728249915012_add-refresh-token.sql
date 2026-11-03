-- Up Migration

ALTER TABLE users ADD COLUMN refresh_token TEXT;

-- Down Migration

ALTER TABLE users DROP COLUMN refresh_token;