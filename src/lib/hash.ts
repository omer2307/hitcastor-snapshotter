import { createHash } from 'node:crypto'

export function sha256(data: Buffer | string): string {
  const hash = createHash('sha256')
  hash.update(data)
  return '0x' + hash.digest('hex')
}