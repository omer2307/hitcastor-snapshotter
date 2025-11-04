import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  REGION: z.string().default('global'),
  
  // Redis/BullMQ
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Postgres
  PG_URL: z.string(),
  
  // Object Storage (R2/S3)
  OBJECT_STORE_ENDPOINT: z.string(),
  OBJECT_STORE_BUCKET: z.string().default('hitcastor-evidence'),
  OBJECT_STORE_ACCESS_KEY: z.string(),
  OBJECT_STORE_SECRET_KEY: z.string(),
  OBJECT_STORE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  OBJECT_STORE_OBJECT_LOCK: z.coerce.boolean().default(true),
  
  // IPFS
  IPFS_ENDPOINT: z.string().optional(),
  IPFS_TOKEN: z.string().optional(),
  
  // Spotify Charts
  SPOTIFY_CHARTS_URL_TEMPLATE: z.string().default(
    'https://charts.spotify.com/api/charts/regional-${REGION}-daily/latest'
  ),
  
  // Alerts
  SLACK_WEBHOOK_URL: z.string().optional(),
  
  // Retry configuration
  MAX_RETRY_HOURS: z.coerce.number().default(36),
  INITIAL_RETRY_DELAY_MS: z.coerce.number().default(300000), // 5 minutes
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path.join('.'))
      
      throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`)
    }
    throw error
  }
}

export const env = loadEnv()