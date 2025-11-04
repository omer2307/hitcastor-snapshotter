import { parse } from 'csv-parse/sync'
import { sha256 } from './hash.js'

export interface Top100Schema {
  schema: 'hitcastor.spotify.top100.v1'
  dateUTC: string
  region: string
  provider: 'spotify'
  sourceCsvUrl: string
  sourceCsvSha256: string
  listLength: 100
  items: Array<{
    rank: number
    trackId: string
    title: string
    artist: string
    streams: number
    isrc: string
    spotifyUrl: string
  }>
}

export interface NormalizeResult {
  json: Top100Schema
  csvHash: string
}

export function normalizeToTop100(
  csvContent: string,
  dateUtc: string,
  region: string,
  sourceCsvUrl: string
): NormalizeResult {
  // Compute hash of original CSV
  const csvHash = sha256(csvContent)
  
  // Parse CSV content
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Invalid or empty CSV data')
  }
  
  // Take top 100 and normalize field names
  const top100Records = records.slice(0, 100)
  
  const items = top100Records.map((record: any, index: number) => {
    const rank = index + 1
    
    // Extract Spotify track ID from various possible fields
    let trackId = record.track_id || record.trackId || record.uri || ''
    if (!trackId.startsWith('spotify:track:') && trackId.includes('/track/')) {
      // Extract from Spotify URL
      const match = trackId.match(/\/track\/([a-zA-Z0-9]+)/)
      if (match) {
        trackId = `spotify:track:${match[1]}`
      }
    }
    
    // Build Spotify URL
    let spotifyUrl = record.spotify_url || record.spotifyUrl || record.url || ''
    if (!spotifyUrl && trackId.startsWith('spotify:track:')) {
      const spotifyId = trackId.replace('spotify:track:', '')
      spotifyUrl = `https://open.spotify.com/track/${spotifyId}`
    }
    
    return {
      rank,
      trackId,
      title: record.title || record.track_name || record.trackName || '',
      artist: record.artist || record.artist_name || record.artistName || '',
      streams: parseInt(record.streams || record.stream_count || record.streamCount || '0', 10),
      isrc: record.isrc || record.ISRC || '',
      spotifyUrl,
    }
  })
  
  // Validate we have at least some valid data
  const validItems = items.filter(item => item.trackId && item.title && item.artist)
  if (validItems.length < 50) {
    throw new Error(`Insufficient valid chart data: only ${validItems.length} valid items found`)
  }
  
  const json: Top100Schema = {
    schema: 'hitcastor.spotify.top100.v1',
    dateUTC: dateUtc,
    region,
    provider: 'spotify',
    sourceCsvUrl,
    sourceCsvSha256: csvHash,
    listLength: items.length,
    items,
  }
  
  return {
    json,
    csvHash,
  }
}

export function getYesterdayUtc(): string {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

export function validateDateFormat(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) return false
  
  const date = new Date(dateStr + 'T00:00:00.000Z')
  return date.toISOString().split('T')[0] === dateStr
}