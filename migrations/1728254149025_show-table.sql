-- Up Migration

CREATE TABLE shows (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL, 
  description TEXT NOT NULL, 
  profile_img_link TEXT NOT NULL,
  release_schedule TEXT NOT NULL, 
  studio TEXT NOT NULL, 
  host_name TEXT NOT NULL, 
  host_img_link TEXT, 
  review_stars INTEGER, 
  review_count INTEGER, 
  rated TEXT
)

-- Down Migrations

DROP TABLE shows;