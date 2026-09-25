CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 1800,
  y REAL NOT NULL DEFAULT 1200,
  angle REAL NOT NULL DEFAULT 0,
  radius REAL NOT NULL DEFAULT 20,
  score REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#10e2d2',
  skin TEXT NOT NULL DEFAULT 'butterfly',
  alive INTEGER NOT NULL DEFAULT 1,
  eaten_by TEXT,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen);
CREATE INDEX IF NOT EXISTS players_alive_score_idx ON players (alive, score DESC);
