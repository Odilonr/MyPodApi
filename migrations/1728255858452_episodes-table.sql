-- Up Migration

CREATE TABLE episodes (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL, 
  description TEXT NOT NULL,
  audio_link TEXT NOT NULL, 
  date_added TIMESTAMP NOT NULL,
  date_updated TIMESTAMP NOT NULL,
  duration INTEGER,
  show_id UUID,
  CONSTRAINT fk_shows
  FOREIGN KEY (show_id)
  REFERENCEs shows(id)
)

-- Down Migrations

DROP TABLE episodes;