#!/usr/bin/env node

import { parseArgs } from 'node:util'
import pino from 'pino'
import { processSnapshotJob } from '../jobs/snapshotJob.js'
import { validateDateFormat } from '../lib/normalize.js'
import { env } from '../env.js'

const logger = pino({
  name: 'hitcastor-snapshotter-backfill',
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
})

function parseDate(dateStr: string): Date {
  const date = new Date(dateStr + 'T00:00:00.000Z')
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }
  return date
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        from: {
          type: 'string',
          short: 'f',
        },
        to: {
          type: 'string',
          short: 't',
        },
        region: {
          type: 'string',
          short: 'r',
          default: env.REGION,
        },
        force: {
          type: 'boolean',
          default: false,
        },
        delay: {
          type: 'string',
          short: 'd',
          default: '5000',
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
    })

    if (values.help) {
      console.log(`
Usage: pnpm backfill [options]

Options:
  -f, --from <YYYY-MM-DD>    Start date (inclusive)
  -t, --to <YYYY-MM-DD>      End date (inclusive)
  -r, --region <region>      Region to backfill (default: ${env.REGION})
      --force               Force re-snapshot even if exists
  -d, --delay <ms>          Delay between snapshots in ms (default: 5000)
  -h, --help                Show this help message

Examples:
  pnpm backfill --from=2024-01-01 --to=2024-01-31
  pnpm backfill --from=2024-01-01 --to=2024-01-31 --region=global --force
      `)
      process.exit(0)
    }

    if (!values.from || !values.to) {
      throw new Error('Both --from and --to dates are required')
    }

    if (!validateDateFormat(values.from) || !validateDateFormat(values.to)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD')
    }

    const fromDate = parseDate(values.from)
    const toDate = parseDate(values.to)
    const region = values.region!
    const force = values.force!
    const delay = parseInt(values.delay!, 10)

    if (fromDate > toDate) {
      throw new Error('From date must be before or equal to to date')
    }

    if (delay < 0) {
      throw new Error('Delay must be non-negative')
    }

    // Calculate date range
    const dates: string[] = []
    let currentDate = fromDate
    while (currentDate <= toDate) {
      dates.push(formatDate(currentDate))
      currentDate = addDays(currentDate, 1)
    }

    logger.info({
      dateRange: `${values.from} to ${values.to}`,
      totalDates: dates.length,
      region,
      force,
      delayMs: delay,
    }, 'Starting backfill operation')

    let successful = 0
    let failed = 0

    for (let i = 0; i < dates.length; i++) {
      const dateUtc = dates[i]
      
      try {
        logger.info({
          progress: `${i + 1}/${dates.length}`,
          dateUtc,
          region,
        }, 'Processing snapshot')

        // Create mock job
        const mockJob = {
          id: `backfill-${dateUtc}-${Date.now()}`,
          data: { dateUtc, region, force },
        }

        // @ts-ignore - Mock job structure is sufficient
        await processSnapshotJob(mockJob)
        
        successful++
        logger.info({ dateUtc, successful, failed }, 'Snapshot completed')

      } catch (error) {
        failed++
        logger.error({ 
          dateUtc, 
          error, 
          successful, 
          failed 
        }, 'Snapshot failed')
        
        // Continue with next date
      }

      // Sleep between requests to avoid overwhelming services
      if (i < dates.length - 1 && delay > 0) {
        await sleep(delay)
      }
    }

    logger.info({
      totalDates: dates.length,
      successful,
      failed,
      successRate: `${((successful / dates.length) * 100).toFixed(1)}%`,
    }, 'Backfill operation completed')

    if (failed > 0) {
      process.exit(1)
    }

  } catch (error) {
    logger.error({ error }, 'Backfill operation failed')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})