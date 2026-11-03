-- Up Migration

ALTER TABLE episodes_progress ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX episodes_progress_user_recent ON episodes_progress (user_id, updated_at DESC);

CREATE TABLE favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);
CREATE INDEX favorites_user_recent ON favorites (user_id, created_at DESC);

CREATE TABLE playlists (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE playlist_episodes (
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position SERIAL,
  PRIMARY KEY (playlist_id, episode_id)
);
CREATE INDEX playlist_episodes_order ON playlist_episodes (playlist_id, position);

-- Down Migration

DROP TABLE playlist_episodes;
DROP TABLE playlists;
DROP TABLE favorites;
DROP INDEX episodes_progress_user_recent;
ALTER TABLE episodes_progress DROP COLUMN updated_at;
