import pg from 'pg'
import { env } from '../env.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.PG_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export interface Snapshot {
  id: number
  dateUtc: string
  region: string
  jsonUrl: string
  jsonSha256: string
  csvUrl: string
  csvSha256: string
  ipfsCid: string | null
  createdAt: Date
}

export async function upsertSnapshot(data: Omit<Snapshot, 'id' | 'createdAt'>): Promise<Snapshot> {
  const query = `
    INSERT INTO snapshots (date_utc, region, json_url, json_sha256, csv_url, csv_sha256, ipfs_cid)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (date_utc, region) 
    DO UPDATE SET 
      json_url = EXCLUDED.json_url,
      json_sha256 = EXCLUDED.json_sha256,
      csv_url = EXCLUDED.csv_url,
      csv_sha256 = EXCLUDED.csv_sha256,
      ipfs_cid = EXCLUDED.ipfs_cid,
      created_at = NOW()
    RETURNING *
  `
  
  const values = [
    data.dateUtc,
    data.region,
    data.jsonUrl,
    data.jsonSha256,
    data.csvUrl,
    data.csvSha256,
    data.ipfsCid,
  ]
  
  const result = await pool.query(query, values)
  const row = result.rows[0]
  
  return {
    id: row.id,
    dateUtc: row.date_utc,
    region: row.region,
    jsonUrl: row.json_url,
    jsonSha256: row.json_sha256,
    csvUrl: row.csv_url,
    csvSha256: row.csv_sha256,
    ipfsCid: row.ipfs_cid,
    createdAt: row.created_at,
  }
}

export async function getLatestSnapshot(region: string = 'global'): Promise<Snapshot | null> {
  const query = `
    SELECT * FROM snapshots 
    WHERE region = $1 
    ORDER BY date_utc DESC 
    LIMIT 1
  `
  
  const result = await pool.query(query, [region])
  if (result.rows.length === 0) return null
  
  const row = result.rows[0]
  return {
    id: row.id,
    dateUtc: row.date_utc,
    region: row.region,
    jsonUrl: row.json_url,
    jsonSha256: row.json_sha256,
    csvUrl: row.csv_url,
    csvSha256: row.csv_sha256,
    ipfsCid: row.ipfs_cid,
    createdAt: row.created_at,
  }
}

export async function getSnapshot(dateUtc: string, region: string = 'global'): Promise<Snapshot | null> {
  const query = `
    SELECT * FROM snapshots 
    WHERE date_utc = $1 AND region = $2
  `
  
  const result = await pool.query(query, [dateUtc, region])
  if (result.rows.length === 0) return null
  
  const row = result.rows[0]
  return {
    id: row.id,
    dateUtc: row.date_utc,
    region: row.region,
    jsonUrl: row.json_url,
    jsonSha256: row.json_sha256,
    csvUrl: row.csv_url,
    csvSha256: row.csv_sha256,
    ipfsCid: row.ipfs_cid,
    createdAt: row.created_at,
  }
}