-- Up Migration

ALTER TABLE episodes ADD COLUMN media_type TEXT NOT NULL DEFAULT 'audio' CHECK (media_type IN ('audio', 'video'));

-- Down Migration

ALTER TABLE episodes DROP COLUMN media_type;
