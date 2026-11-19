import { createHash, createHmac } from 'node:crypto'
import type { AttributeValue } from '@aws-sdk/client-dynamodb'

export type WhatsAppLinkRole = 'customer' | 'trainer'

const allowedHosts = new Set([
  'fitpeso.com.br',
  'www.fitpeso.com.br',
  'develop.fitpeso.com.br',
])

export function createWhatsAppMagicLink(input: {
  code: string
  whatsapp: string
  role: WhatsAppLinkRole
  challengeExpiresAt: number
  secret: string
  baseUrl: string
  nowSeconds: number
  trainerId?: string
  city?: string
}) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(input.code) || !/^\+55\d{10,11}$/.test(input.whatsapp) ||
      !input.secret || !Number.isSafeInteger(input.challengeExpiresAt) ||
      !Number.isSafeInteger(input.nowSeconds) || input.challengeExpiresAt <= input.nowSeconds) {
    throw new Error('Invalid WhatsApp login link request')
  }
  const url = new URL(input.baseUrl)
  // Avoid open redirects: only the owned production and development origins are accepted.
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Untrusted WhatsApp login URL')
  }
  if (input.role === 'trainer' && (!input.trainerId || !input.city)) {
    throw new Error('Trainer identification is required')
  }
  // Domain-separated keyed token, reproducible on safe retries by the verified Beta.
  const token = createHmac('sha256', input.secret)
    .update('fitpeso:whatsapp-magic-link:v1:' + input.code)
    .digest('base64url')
  const codeHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = Math.min(input.challengeExpiresAt, input.nowSeconds + 5 * 60)
  url.searchParams.set('whatsappLoginCode', token)
  const item: Record<string, AttributeValue> = {
    codeHash: { S: codeHash },
    flow: { S: 'fitpeso-whatsapp-login-link' },
    whatsapp: { S: input.whatsapp },
    role: { S: input.role },
    expiresAt: { N: String(expiresAt) },
  }
  if (input.role === 'trainer') {
    item.trainerId = { S: input.trainerId! }
    item.city = { S: input.city! }
  }
  return { loginLink: url.toString(), linkHash: codeHash, expiresAt, item }
}
