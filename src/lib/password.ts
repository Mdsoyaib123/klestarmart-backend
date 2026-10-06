import { randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto'

const KEY_LENGTH = 64
const OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1 }

const derive = (password: BinaryLike, salt: BinaryLike) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, OPTIONS, (error, key) => (error ? reject(error) : resolve(key)))
  })

// Stored as "scrypt$<salt>$<hash>" so the format can change later without breaking old hashes.
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt)
  return `scrypt$${salt}$${key.toString('hex')}`
}

export const verifyPassword = async (password: string, stored: string) => {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = await derive(password, salt)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
