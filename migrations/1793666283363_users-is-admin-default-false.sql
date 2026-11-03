-- Up Migration

-- Every account so far became an admin by accident, so remove admin from all
-- of them. Use "npm run make-admin -- <username>" to give it back on purpose.
ALTER TABLE users ALTER COLUMN is_admin SET DEFAULT FALSE;
UPDATE users SET is_admin = FALSE;
ALTER TABLE users ALTER COLUMN is_admin SET NOT NULL;

-- Down Migration

ALTER TABLE users ALTER COLUMN is_admin DROP NOT NULL;
ALTER TABLE users ALTER COLUMN is_admin SET DEFAULT TRUE;
