import { describe, it, expect } from 'vitest'
import { normalizeToTop100, validateDateFormat, getYesterdayUtc } from '../lib/normalize.js'

describe('normalize', () => {
  const mockCsvContent = `rank,track_name,artist_name,streams,uri
1,Blinding Lights,The Weeknd,1234567,spotify:track:0VjIjW4GlULA
2,Shape of You,Ed Sheeran,987654,spotify:track:7qiZfU4dY4WnASrxmjMzxQ
3,Someone You Loved,Lewis Capaldi,876543,spotify:track:7qEHsqek33rTcFNT9PFqLf`

  describe('normalizeToTop100', () => {
    it('should parse CSV and create valid Top100Schema', () => {
      const result = normalizeToTop100(
        mockCsvContent,
        '2024-01-15',
        'global',
        'https://charts.spotify.com/api/test'
      )

      expect(result.json.schema).toBe('hitcastor.spotify.top100.v1')
      expect(result.json.dateUTC).toBe('2024-01-15')
      expect(result.json.region).toBe('global')
      expect(result.json.provider).toBe('spotify')
      expect(result.json.listLength).toBe(3)
      expect(result.json.items).toHaveLength(3)

      const firstItem = result.json.items[0]
      expect(firstItem.rank).toBe(1)
      expect(firstItem.title).toBe('Blinding Lights')
      expect(firstItem.artist).toBe('The Weeknd')
      expect(firstItem.streams).toBe(1234567)
      expect(firstItem.trackId).toBe('spotify:track:0VjIjW4GlULA')
      expect(firstItem.spotifyUrl).toBe('https://open.spotify.com/track/0VjIjW4GlULA')
    })

    it('should generate consistent hash for same CSV content', () => {
      const result1 = normalizeToTop100(mockCsvContent, '2024-01-15', 'global', 'test-url')
      const result2 = normalizeToTop100(mockCsvContent, '2024-01-15', 'global', 'test-url')

      expect(result1.csvHash).toBe(result2.csvHash)
      expect(result1.csvHash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should handle CSV with 200 entries and return top 100', () => {
      const largeCsv = 'rank,track_name,artist_name,streams,uri\n' + 
        Array.from({ length: 200 }, (_, i) => 
          `${i + 1},Track ${i + 1},Artist ${i + 1},${1000000 - i * 1000},spotify:track:track${i + 1}`
        ).join('\n')

      const result = normalizeToTop100(largeCsv, '2024-01-15', 'global', 'test-url')
      
      expect(result.json.listLength).toBe(100)
      expect(result.json.items).toHaveLength(100)
      expect(result.json.items[99].rank).toBe(100)
    })

    it('should throw error for insufficient valid data', () => {
      const invalidCsv = `rank,track_name,artist_name,streams,uri
1,,,0,
2,,,0,`

      expect(() => {
        normalizeToTop100(invalidCsv, '2024-01-15', 'global', 'test-url')
      }).toThrow('Insufficient valid chart data')
    })
  })

  describe('validateDateFormat', () => {
    it('should validate correct date formats', () => {
      expect(validateDateFormat('2024-01-15')).toBe(true)
      expect(validateDateFormat('2023-12-31')).toBe(true)
      expect(validateDateFormat('2024-02-29')).toBe(true) // Leap year
    })

    it('should reject invalid date formats', () => {
      expect(validateDateFormat('24-01-15')).toBe(false)
      expect(validateDateFormat('2024-1-15')).toBe(false)
      expect(validateDateFormat('2024-01-32')).toBe(false)
      expect(validateDateFormat('2024-13-01')).toBe(false)
      expect(validateDateFormat('not-a-date')).toBe(false)
      expect(validateDateFormat('')).toBe(false)
    })
  })

  describe('getYesterdayUtc', () => {
    it('should return yesterday in YYYY-MM-DD format', () => {
      const yesterday = getYesterdayUtc()
      expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(validateDateFormat(yesterday)).toBe(true)
      
      // Should be yesterday
      const expectedDate = new Date()
      expectedDate.setUTCDate(expectedDate.getUTCDate() - 1)
      const expected = expectedDate.toISOString().split('T')[0]
      
      expect(yesterday).toBe(expected)
    })
  })
})