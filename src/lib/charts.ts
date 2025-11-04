import { env } from '../env.js'

export interface ChartEntry {
  rank: number
  trackId: string
  title: string
  artist: string
  streams: number
  isrc: string
  spotifyUrl: string
}

export function buildChartUrl(dateUtc: string, region: string = 'global'): string {
  return env.SPOTIFY_CHARTS_URL_TEMPLATE
    .replace('${REGION}', region)
    .replace('${DATE}', dateUtc)
}

export async function fetchChartCsv(dateUtc: string, region: string = 'global'): Promise<string> {
  const url = buildChartUrl(dateUtc, region)
  
  const maxRetries = Math.ceil(env.MAX_RETRY_HOURS * 60 * 60 * 1000 / env.INITIAL_RETRY_DELAY_MS)
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Fetching chart CSV for ${dateUtc}/${region}, attempt ${attempt + 1}/${maxRetries}`)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'hitcastor-snapshotter/1.0.0',
          'Accept': 'text/csv,*/*',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const csvText = await response.text()
      
      if (!csvText || csvText.trim().length === 0) {
        throw new Error('Empty CSV response')
      }
      
      console.log(`Successfully fetched chart CSV for ${dateUtc}/${region}`)
      return csvText
      
    } catch (error) {
      lastError = error as Error
      console.warn(`Attempt ${attempt + 1} failed:`, error)
      
      if (attempt < maxRetries - 1) {
        const delayMs = env.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
        const jitter = Math.random() * 0.1 * delayMs
        const totalDelay = delayMs + jitter
        
        console.log(`Retrying in ${Math.round(totalDelay / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, totalDelay))
      }
    }
  }
  
  // Send alert if configured
  if (env.SLACK_WEBHOOK_URL) {
    await sendSlackAlert(dateUtc, region, lastError!)
  }
  
  throw new Error(`Failed to fetch chart CSV after ${maxRetries} attempts: ${lastError?.message}`)
}

async function sendSlackAlert(dateUtc: string, region: string, error: Error): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return
  
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Hitcastor Snapshotter Alert`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Failed to fetch Spotify chart data*\n\n*Date:* ${dateUtc}\n*Region:* ${region}\n*Error:* ${error.message}`,
            },
          },
        ],
      }),
    })
  } catch (alertError) {
    console.error('Failed to send Slack alert:', alertError)
  }
}