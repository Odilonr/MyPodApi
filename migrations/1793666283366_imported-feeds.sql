-- Up Migration

-- A show with no owner belongs to the catalog. A show with an owner was imported
-- by that user and is private to them.
ALTER TABLE shows ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE shows ADD COLUMN feed_url TEXT;
ALTER TABLE shows ADD COLUMN source_link TEXT;
CREATE INDEX shows_owner ON shows (owner_id);
CREATE UNIQUE INDEX shows_owner_feed ON shows (owner_id, feed_url) WHERE owner_id IS NOT NULL;

ALTER TABLE episodes ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX episodes_show_external ON episodes (show_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX episodes_show ON episodes (show_id);

-- Removing a show now removes its episodes.
ALTER TABLE episodes DROP CONSTRAINT fk_shows;
ALTER TABLE episodes ADD CONSTRAINT fk_shows FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE episodes DROP CONSTRAINT fk_shows;
ALTER TABLE episodes ADD CONSTRAINT fk_shows FOREIGN KEY (show_id) REFERENCES shows(id);
DROP INDEX episodes_show;
DROP INDEX episodes_show_external;
ALTER TABLE episodes DROP COLUMN external_id;
DROP INDEX shows_owner_feed;
DROP INDEX shows_owner;
ALTER TABLE shows DROP COLUMN source_link;
ALTER TABLE shows DROP COLUMN feed_url;
ALTER TABLE shows DROP COLUMN owner_id;
