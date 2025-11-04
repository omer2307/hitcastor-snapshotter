import Fastify from 'fastify'
import cors from '@fastify/cors'
import pino from 'pino'
import { getLatestSnapshot } from './db/client.js'
import { env } from './env.js'

const logger = pino({
  name: 'hitcastor-snapshotter',
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

export function createApp() {
  const fastify = Fastify({
    logger,
    disableRequestLogging: env.NODE_ENV === 'production',
  })

  // Register plugins
  fastify.register(cors, {
    origin: true,
    credentials: true,
  })

  // Health endpoint
  fastify.get('/health', async (request, reply) => {
    try {
      const latestSnapshot = await getLatestSnapshot(env.REGION)
      
      const response = {
        status: 'ok',
        service: 'hitcastor-snapshotter',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        region: env.REGION,
        lastSnapshot: latestSnapshot ? {
          dateUTC: latestSnapshot.dateUtc,
          region: latestSnapshot.region,
          createdAt: latestSnapshot.createdAt.toISOString(),
          csvSha256: latestSnapshot.csvSha256,
          jsonSha256: latestSnapshot.jsonSha256,
          ipfsCid: latestSnapshot.ipfsCid,
        } : null,
      }
      
      return response
    } catch (error) {
      logger.error({ error }, 'Health check failed')
      
      reply.status(503)
      return {
        status: 'error',
        service: 'hitcastor-snapshotter',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      }
    }
  })

  // Root endpoint
  fastify.get('/', async () => {
    return {
      service: 'hitcastor-snapshotter',
      version: '1.0.0',
      description: 'Daily Spotify chart snapshotter for Hitcastor prediction markets',
      endpoints: {
        health: '/health',
      },
    }
  })

  return fastify
}

export async function startServer(port = env.PORT) {
  const app = createApp()
  
  try {
    await app.listen({ port, host: '0.0.0.0' })
    app.log.info(`Server started on port ${port}`)
    return app
  } catch (error) {
    app.log.error({ error }, 'Failed to start server')
    process.exit(1)
  }
}