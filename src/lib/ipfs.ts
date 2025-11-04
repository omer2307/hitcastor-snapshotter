import { create } from 'ipfs-http-client'
import { env } from '../env.js'

let ipfsClient: ReturnType<typeof create> | null = null

function getIpfsClient() {
  if (!env.IPFS_ENDPOINT || !env.IPFS_TOKEN) {
    throw new Error('IPFS not configured - missing IPFS_ENDPOINT or IPFS_TOKEN')
  }
  
  if (!ipfsClient) {
    ipfsClient = create({
      url: env.IPFS_ENDPOINT,
      headers: {
        Authorization: `Bearer ${env.IPFS_TOKEN}`,
      },
    })
  }
  
  return ipfsClient
}

export async function pinContent(content: string | Buffer): Promise<string> {
  if (!env.IPFS_ENDPOINT || !env.IPFS_TOKEN) {
    console.warn('IPFS not configured, skipping pin operation')
    return ''
  }
  
  try {
    const client = getIpfsClient()
    const result = await client.add(content, { pin: true })
    return result.cid.toString()
  } catch (error) {
    console.error('Failed to pin to IPFS:', error)
    return ''
  }
}

export async function pinJson(data: object): Promise<string> {
  const jsonString = JSON.stringify(data, null, 2)
  return pinContent(jsonString)
}