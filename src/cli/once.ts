#!/usr/bin/env node

import { parseArgs } from 'node:util'
import pino from 'pino'
import { processSnapshotJob } from '../jobs/snapshotJob.js'
import { validateDateFormat } from '../lib/normalize.js'
import { env } from '../env.js'

const logger = pino({
  name: 'hitcastor-snapshotter-once',
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
})

async function main() {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        date: {
          type: 'string',
          short: 'd',
        },
        region: {
          type: 'string',
          short: 'r',
          default: env.REGION,
        },
        force: {
          type: 'boolean',
          short: 'f',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      allowPositionals: true,
    })

    if (values.help) {
      console.log(`
Usage: pnpm once [options]

Options:
  -d, --date <YYYY-MM-DD>    Date to snapshot (default: yesterday UTC)
  -r, --region <region>      Region to snapshot (default: ${env.REGION})
  -f, --force               Force re-snapshot even if exists
  -h, --help                Show this help message

Examples:
  pnpm once --date=2024-01-15
  pnpm once --date=2024-01-15 --region=global --force
      `)
      process.exit(0)
    }

    const date = values.date
    const region = values.region!
    const force = values.force!

    // Validate date format if provided
    if (date && !validateDateFormat(date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD')
    }

    // Create a mock job object for the processor
    const mockJob = {
      id: `once-${Date.now()}`,
      data: {
        dateUtc: date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        region,
        force,
      },
    }

    logger.info({
      dateUtc: mockJob.data.dateUtc,
      region: mockJob.data.region,
      force: mockJob.data.force,
    }, 'Starting one-time snapshot')

    // @ts-ignore - Mock job structure is sufficient for our needs
    await processSnapshotJob(mockJob)

    logger.info('Snapshot completed successfully')
    process.exit(0)

  } catch (error) {
    logger.error({ error }, 'Snapshot failed')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})