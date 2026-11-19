import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A published HMAC remains fixed and reusable for everyone sharing the same
 * invitation. Its purpose is message integrity, not sender authentication.
 * The secret NEVER appears in the invitation or in browser-side JavaScript.
 */
const context = 'fitpeso.beta.onboarding-message.v1\n'
const suffix = '\nHash: '

export function signBetaOnboardingMessage(message: string, secret: string) {
  if (!secret || typeof message !== 'string' || !message ||
      message.length > 450 || /[\r\n\u0000-\u001f\u007f]/.test(message)) {
    throw new Error('Invalid signed onboarding message')
  }
  return createHmac('sha256', secret).update(context).update(message, 'utf8').digest('hex')
}

export function createBetaOnboardingInvitation(message: string, secret: string) {
  const signature = signBetaOnboardingMessage(message, secret)
  return {
    message,
    hash: signature,
    shareText: message + suffix + signature,
  }
}

/**
 * Strictly checks the exact bytes of the sent message. No trim, Unicode
 * normalization, punctuation or case transformations before verification.
 */
export function verifyBetaOnboardingInvitation(received: unknown, secret: string): string | null {
  if (typeof received !== 'string' || !secret || received.length > 530) return null
  const boundary = received.lastIndexOf(suffix)
  if (boundary <= 0 || received.indexOf(suffix) !== boundary) return null
  const message = received.slice(0, boundary)
  const provided = received.slice(boundary + suffix.length)
  if (!/^[a-f0-9]{64}$/.test(provided)) return null
  try {
    const expected = Buffer.from(signBetaOnboardingMessage(message, secret), 'hex')
    return timingSafeEqual(expected, Buffer.from(provided, 'hex')) ? message : null
  } catch {
    return null
  }
}
