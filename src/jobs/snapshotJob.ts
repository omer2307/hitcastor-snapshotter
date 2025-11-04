import { Job } from 'bullmq'
import pino from 'pino'
import { fetchChartCsv, buildChartUrl } from '../lib/charts.js'
import { normalizeToTop100, getYesterdayUtc } from '../lib/normalize.js'
import { uploadFile, buildObjectKey, fileExists } from '../lib/store.js'
import { pinJson } from '../lib/ipfs.js'
import { upsertSnapshot, getSnapshot } from '../db/client.js'
import { env } from '../env.js'

const logger = pino({
  name: 'snapshotJob',
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
})

export interface SnapshotJobData {
  dateUtc: string
  region: string
  force?: boolean
}

export async function processSnapshotJob(job: Job<SnapshotJobData>): Promise<void> {
  const { dateUtc, region, force = false } = job.data
  
  const jobLogger = logger.child({
    jobId: job.id,
    dateUtc,
    region,
    force,
  })
  
  jobLogger.info('Starting snapshot job')
  
  try {
    // Check if snapshot already exists and is valid
    if (!force) {
      const existing = await getSnapshot(dateUtc, region)
      if (existing) {
        jobLogger.info('Snapshot already exists, skipping')
        return
      }
    }
    
    // Step 1: Fetch CSV from Spotify Charts
    jobLogger.info('Fetching chart CSV')
    const csvContent = await fetchChartCsv(dateUtc, region)
    const sourceCsvUrl = buildChartUrl(dateUtc, region)
    
    // Step 2: Normalize to Top-100 JSON
    jobLogger.info('Normalizing to Top-100 JSON')
    const { json, csvHash } = normalizeToTop100(csvContent, dateUtc, region, sourceCsvUrl)
    
    // Step 3: Upload CSV and JSON to object storage
    jobLogger.info('Uploading to object storage')
    
    const csvKey = buildObjectKey(dateUtc, region, 't.csv')
    const jsonKey = buildObjectKey(dateUtc, region, 't.json')
    
    // Check if files already exist (idempotency)
    const [csvExists, jsonExists] = await Promise.all([
      fileExists(csvKey),
      fileExists(jsonKey),
    ])
    
    let csvUploadResult, jsonUploadResult
    
    if (!csvExists || force) {
      csvUploadResult = await uploadFile(csvKey, csvContent, 'text/csv')
      jobLogger.info({ csvHash: csvUploadResult.sha256 }, 'CSV uploaded')
    } else {
      // File exists, construct URL (hash will be verified from DB)
      csvUploadResult = {
        url: `${env.OBJECT_STORE_ENDPOINT}/${env.OBJECT_STORE_BUCKET}/${csvKey}`,
        sha256: csvHash, // We computed this from the fresh CSV
      }
      jobLogger.info('CSV already exists in storage')
    }
    
    if (!jsonExists || force) {
      const jsonContent = JSON.stringify(json, null, 2)
      jsonUploadResult = await uploadFile(jsonKey, jsonContent, 'application/json')
      jobLogger.info({ jsonHash: jsonUploadResult.sha256 }, 'JSON uploaded')
    } else {
      // File exists, compute hash from our JSON
      const { sha256 } = await import('../lib/hash.js')
      const jsonContent = JSON.stringify(json, null, 2)
      jsonUploadResult = {
        url: `${env.OBJECT_STORE_ENDPOINT}/${env.OBJECT_STORE_BUCKET}/${jsonKey}`,
        sha256: sha256(jsonContent),
      }
      jobLogger.info('JSON already exists in storage')
    }
    
    // Step 4: Pin to IPFS (optional)
    let ipfsCid = ''
    try {
      if (env.IPFS_ENDPOINT && env.IPFS_TOKEN) {
        jobLogger.info('Pinning JSON to IPFS')
        ipfsCid = await pinJson(json)
        if (ipfsCid) {
          jobLogger.info({ ipfsCid }, 'JSON pinned to IPFS')
        }
      }
    } catch (ipfsError) {
      jobLogger.warn({ error: ipfsError }, 'IPFS pinning failed, continuing without CID')
    }
    
    // Step 5: Upsert to database
    jobLogger.info('Saving snapshot to database')
    const snapshot = await upsertSnapshot({
      dateUtc,
      region,
      jsonUrl: jsonUploadResult.url,
      jsonSha256: jsonUploadResult.sha256,
      csvUrl: csvUploadResult.url,
      csvSha256: csvUploadResult.sha256,
      ipfsCid: ipfsCid || null,
    })
    
    jobLogger.info(
      {
        snapshotId: snapshot.id,
        csvSha256: snapshot.csvSha256,
        jsonSha256: snapshot.jsonSha256,
        ipfsCid: snapshot.ipfsCid,
        itemCount: json.items.length,
      },
      'Snapshot job completed successfully'
    )
    
  } catch (error) {
    jobLogger.error({ error }, 'Snapshot job failed')
    throw error
  }
}

export function createSnapshotJobData(dateUtc?: string, region?: string, force = false): SnapshotJobData {
  return {
    dateUtc: dateUtc || getYesterdayUtc(),
    region: region || env.REGION,
    force,
  }
}