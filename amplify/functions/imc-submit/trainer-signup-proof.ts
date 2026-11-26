import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
export const newTrainerSignupToken = () => randomBytes(32).toString('base64url')
export const trainerSignupTokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export function matchesTrainerSignupToken(token: unknown, expected: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(trainerSignupTokenHash(token), 'hex'), Buffer.from(expected, 'hex'))
}
