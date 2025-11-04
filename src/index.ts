import { Worker, Queue } from 'bullmq'
import Redis from 'ioredis'
import pino from 'pino'
import { processSnapshotJob, createSnapshotJobData } from './jobs/snapshotJob.js'
import { startServer } from './app.js'
import { env } from './env.js'

const logger = pino({
  name: 'hitcastor-snapshotter-main',
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

// Redis connection
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
})

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error')
})

redis.on('connect', () => {
  logger.info('Connected to Redis')
})

// BullMQ setup
const QUEUE_NAME = 'snapshots'

const snapshotQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30 seconds
    },
  },
})

const worker = new Worker(
  QUEUE_NAME,
  processSnapshotJob,
  {
    connection: redis,
    concurrency: 1, // Process one snapshot at a time
  }
)

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, data: job.data }, 'Job completed successfully')
})

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, data: job?.data, error }, 'Job failed')
})

worker.on('error', (error) => {
  logger.error({ error }, 'Worker error')
})

// Schedule daily snapshots at 00:00 UTC
async function setupSchedule() {
  try {
    // Remove any existing repeatable jobs
    const repeatableJobs = await snapshotQueue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      await snapshotQueue.removeRepeatableByKey(job.key)
    }
    
    // Add new repeatable job for daily execution at 00:00 UTC
    await snapshotQueue.add(
      'daily-snapshot',
      createSnapshotJobData(),
      {
        repeat: {
          pattern: '0 0 * * *', // Daily at 00:00 UTC
          tz: 'UTC',
        },
        jobId: 'daily-snapshot', // Ensure only one instance
      }
    )
    
    logger.info('Daily snapshot schedule configured for 00:00 UTC')
  } catch (error) {
    logger.error({ error }, 'Failed to setup schedule')
    throw error
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`)
  
  try {
    await worker.close()
    await snapshotQueue.close()
    await redis.quit()
    logger.info('Shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error({ error }, 'Error during shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Main startup
async function main() {
  try {
    logger.info('Starting Hitcastor Snapshotter')
    
    // Connect to Redis
    await redis.connect()
    
    // Setup job schedule
    await setupSchedule()
    
    // Start HTTP server
    await startServer()
    
    logger.info('Hitcastor Snapshotter started successfully')
    
    // Optionally run immediate snapshot for testing in development
    if (env.NODE_ENV === 'development') {
      logger.info('Development mode: adding immediate test job')
      await snapshotQueue.add('test-snapshot', createSnapshotJobData())
    }
    
  } catch (error) {
    logger.error({ error }, 'Failed to start application')
    process.exit(1)
  }
}

// Export queue for CLI usage
export { snapshotQueue }

// Start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error({ error }, 'Unhandled error in main')
    process.exit(1)
  })
}