-- Up Migration

-- One catalog show per feed, so a repeat sync updates it instead of copying it.
CREATE UNIQUE INDEX shows_catalog_feed ON shows (feed_url) WHERE owner_id IS NULL AND feed_url IS NOT NULL;

-- The made-up sample shows are replaced by real public feeds.
DELETE FROM shows WHERE owner_id IS NULL AND name LIKE 'Sample: %';

-- Down Migration

DROP INDEX shows_catalog_feed;
