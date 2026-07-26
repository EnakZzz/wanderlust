CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  allow_copy INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_trip_owner ON shares(trip_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
