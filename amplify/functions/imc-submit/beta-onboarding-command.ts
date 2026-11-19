export type BetaRole = 'customer' | 'trainer'
export type BetaOnboardingMessage = {
  role: BetaRole
  city?: string
  neighborhood?: string
  academyName?: string
  sexHint?: 'masculino' | 'feminino'
}

const supportedCities: Record<string, string> = {
  mesquita: 'Mesquita',
  nilopolis: 'Nilópolis',
  'nova iguacu': 'Nova Iguaçu',
  'rio de janeiro': 'Rio de Janeiro',
}
function plain(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Only explicit requests for FitPeso are interpreted as account creation. */
export function parseBetaOnboardingMessage(message: unknown): BetaOnboardingMessage | null {
  if (typeof message !== 'string' || message.length > 500 || !message.trim()) return null
  const text = plain(message).replace(/[.!?]+$/, '').trim()
  if (text === 'sou cliente fitpeso') return { role: 'customer' }
  if (text === 'sou personal fitpeso') return { role: 'trainer' }

  // Natural registration request: "Sou professora da Academia Aquatic Center,
  // no bairro Vila Emil, em Mesquita, e quero me cadastrar na FitPeso".
  if (!/\b(?:quero|gostaria(?: de)?)\s+(?:me\s+)?cadastr(?:ar|o)\s+(?:na|no)\s+fitpeso$/.test(text)) return null
  const lead = text.match(/^sou\s+(professora|professor|personal(?:\s+trainer)?)\s+d[ao]\s+(?:academia\s+)?(.+)$/)
  if (!lead) return null
  const city = text.match(/\bem\s+(mesquita|nilopolis|nova iguacu|rio de janeiro)\b/)
  const neighborhood = text.match(/\b(?:no\s+bairro|bairro)\s+(.+?)(?=,?\s+em\s+(?:mesquita|nilopolis|nova iguacu|rio de janeiro)\b|,?\s+e\s+quero\b|,?\s+quero\b|$)/)
  const academyName = lead[2].split(/,?\s+(?:no\s+bairro\b|bairro\b|em\s+(?:mesquita|nilopolis|nova iguacu|rio de janeiro)\b|e\s+quero\b|quero\b)/)[0].trim().replace(/[,.!]+$/, '').trim()
  if (!academyName || academyName.length > 80 || /https?:|www\.|@/.test(academyName)) return null
  return {
    role: 'trainer',
    ...(city ? { city: supportedCities[city[1]] } : {}),
    ...(neighborhood ? { neighborhood: neighborhood[1].replace(/[,.!]+$/, '').trim() } : {}),
    academyName,
    ...(lead[1] === 'professora' ? { sexHint: 'feminino' as const } : {}),
    ...(lead[1] === 'professor' ? { sexHint: 'masculino' as const } : {}),
  }
}

/** Backward-compatible role parser for Beta. */
export function parseBetaOnboardingCommand(message: unknown): BetaRole | null {
  return parseBetaOnboardingMessage(message)?.role ?? null
}
