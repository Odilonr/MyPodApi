-- Up Migration

CREATE TABLE IF NOT EXISTS episodes_progress (
  id UUID PRIMARY KEY,
  currentplaytime INTEGER NOT NULL DEFAULT 0,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE (user_id, episode_id)
);

-- Down Migration

DROP TABLE episodes_progress;
