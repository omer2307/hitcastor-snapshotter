#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { pool } from '../db/client.js'

const logger = pino({
  name: 'hitcastor-snapshotter-migrate',
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
})

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  try {
    logger.info('Starting database migration')
    
    // Read schema file
    const schemaPath = join(__dirname, '../db/schema.sql')
    const schema = await readFile(schemaPath, 'utf-8')
    
    // Execute schema
    await pool.query(schema)
    
    logger.info('Database migration completed successfully')
    
    // Test connection
    const result = await pool.query('SELECT COUNT(*) as count FROM snapshots')
    logger.info({ snapshotCount: result.rows[0].count }, 'Database connection verified')
    
    await pool.end()
    process.exit(0)
    
  } catch (error) {
    logger.error({ error }, 'Database migration failed')
    await pool.end()
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})