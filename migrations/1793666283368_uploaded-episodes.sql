-- Up Migration

-- An uploaded episode has a storage_key, which is the random name of its file.
ALTER TABLE episodes ADD COLUMN storage_key TEXT UNIQUE;
ALTER TABLE episodes ADD COLUMN content_type TEXT;
ALTER TABLE episodes ADD COLUMN file_size BIGINT;

-- Files with the same show name go into one show, per user.
CREATE UNIQUE INDEX shows_owner_upload_name ON shows (owner_id, name) WHERE owner_id IS NOT NULL AND feed_url IS NULL;

-- Down Migration

DROP INDEX shows_owner_upload_name;
ALTER TABLE episodes DROP COLUMN file_size;
ALTER TABLE episodes DROP COLUMN content_type;
ALTER TABLE episodes DROP COLUMN storage_key;
