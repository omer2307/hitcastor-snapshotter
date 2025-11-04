import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../env.js'

export const s3Client = new S3Client({
  endpoint: env.OBJECT_STORE_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: env.OBJECT_STORE_ACCESS_KEY,
    secretAccessKey: env.OBJECT_STORE_SECRET_KEY,
  },
  forcePathStyle: env.OBJECT_STORE_FORCE_PATH_STYLE,
})

export interface UploadResult {
  url: string
  sha256: string
}

export async function uploadFile(
  key: string, 
  content: Buffer | string, 
  contentType: string
): Promise<UploadResult> {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
  
  const putCommand = new PutObjectCommand({
    Bucket: env.OBJECT_STORE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ...(env.OBJECT_STORE_OBJECT_LOCK && {
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }),
  })
  
  await s3Client.send(putCommand)
  
  const url = `${env.OBJECT_STORE_ENDPOINT}/${env.OBJECT_STORE_BUCKET}/${key}`
  
  // Import hash function
  const { sha256 } = await import('./hash.js')
  const fileHash = sha256(buffer)
  
  return { url, sha256: fileHash }
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: env.OBJECT_STORE_BUCKET,
      Key: key,
    }))
    return true
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}

export async function downloadFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: env.OBJECT_STORE_BUCKET,
    Key: key,
  })
  
  const response = await s3Client.send(command)
  
  if (!response.Body) {
    throw new Error(`File not found: ${key}`)
  }
  
  const chunks: Uint8Array[] = []
  const reader = response.Body.transformToWebStream().getReader()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  
  return Buffer.concat(chunks)
}

export function buildObjectKey(dateUtc: string, region: string, filename: string): string {
  return `snapshots/${dateUtc}/${region}/${filename}`
}