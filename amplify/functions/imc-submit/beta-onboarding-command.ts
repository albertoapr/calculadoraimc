export type BetaRole = 'customer' | 'trainer'

/** Only commands intentionally sent by the WhatsApp account owner qualify. */
export function parseBetaOnboardingCommand(message: unknown): BetaRole | null {
  if (typeof message !== 'string' || message.length > 120) return null
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/[.!?]+$/, '').trim().replace(/\s+/g, ' ')
  if (normalized === 'sou cliente fitpeso') return 'customer'
  if (normalized === 'sou personal fitpeso') return 'trainer'
  return null
}
