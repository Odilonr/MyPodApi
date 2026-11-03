-- Up Migration

CREATE TABLE users (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  username TEXT UNIQUE, 
  password TEXT NOT NULL,
  email TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT TRUE
);

-- Down Migration

DROP TABLE users;
