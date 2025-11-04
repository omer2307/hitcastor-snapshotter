-- Snapshots table for storing daily chart metadata
CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  date_utc DATE NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  json_url TEXT NOT NULL,
  json_sha256 TEXT NOT NULL,
  csv_url TEXT NOT NULL,
  csv_sha256 TEXT NOT NULL,
  ipfs_cid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_date_region UNIQUE(date_utc, region)
);

-- Index for fast lookups by date/region
CREATE INDEX IF NOT EXISTS idx_snapshots_date_region 
ON snapshots(date_utc DESC, region);

-- Index for latest snapshot queries
CREATE INDEX IF NOT EXISTS idx_snapshots_region_date 
ON snapshots(region, date_utc DESC);