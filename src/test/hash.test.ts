import { describe, it, expect } from 'vitest'
import { sha256 } from '../lib/hash.js'

describe('hash', () => {
  describe('sha256', () => {
    it('should generate consistent SHA256 hashes', () => {
      const input = 'test data'
      const hash1 = sha256(input)
      const hash2 = sha256(input)
      
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should handle Buffer input', () => {
      const buffer = Buffer.from('test data', 'utf-8')
      const hash = sha256(buffer)
      
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('input1')
      const hash2 = sha256('input2')
      
      expect(hash1).not.toBe(hash2)
    })

    it('should produce known hash for known input', () => {
      // Known test vector
      const input = 'hello world'
      const expectedHash = '0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      
      expect(sha256(input)).toBe(expectedHash)
    })

    it('should handle empty input', () => {
      const hash = sha256('')
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
      
      // SHA256 of empty string
      expect(hash).toBe('0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })
  })
})