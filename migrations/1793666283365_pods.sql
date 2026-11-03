-- Up Migration

-- Each user has one pod, which holds their home page layout.
CREATE TABLE pods (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pod_sections (
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  position INTEGER NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  size TEXT NOT NULL DEFAULT 'large' CHECK (size IN ('small', 'large')),
  settings JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (pod_id, section_type),
  UNIQUE (pod_id, position)
);

-- Down Migration

DROP TABLE pod_sections;
DROP TABLE pods;
