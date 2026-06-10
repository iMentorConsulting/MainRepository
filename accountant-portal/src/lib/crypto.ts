import crypto from 'crypto'

// Symmetric encryption for sensitive credentials (e.g. AADE/TAXISnet password)
// stored at rest in the database. Uses AES-256-GCM with a key derived from
// NEXTAUTH_SECRET/AUTH_SECRET (or a dedicated ENCRYPTION_KEY if set), so no
// extra Railway env var is strictly required.
const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing ENCRYPTION_KEY/NEXTAUTH_SECRET for encryption')
  return crypto.createHash('sha256').update(secret).digest()
}

// Returns "iv:authTag:ciphertext" all hex-encoded.
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) {
    // Not in encrypted format (e.g. legacy plaintext value) — return as-is.
    return payload
  }
  const [ivHex, authTagHex, dataHex] = parts
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    // Decryption failed (e.g. legacy plaintext that happens to contain colons)
    return payload
  }
}
