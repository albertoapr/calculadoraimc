const PERSON_NAME_PATTERN = /^[\p{L}\p{M} .'-]+$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INSTAGRAM_PATTERN = /^@[A-Za-z0-9._]{1,30}$/
const PROFILE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const LOOSE_CREF_PATTERN = /^[\p{L}\p{M}0-9 ./-]{1,40}$/u
const FORMATTED_CREF_PATTERN = /^[0-9]{1,10}-[GP]\/[A-Z]{2}$/

export const reservedProfileSlugs = new Set([
  'www',
  'api',
  'mail',
  'ftp',
  'admin',
  'app',
  'beta',
  'fitpeso',
  'suporte',
  'ajuda',
  'develop',
  'test',
  'homologacao',
])

export function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function isValidPersonName(value: string, allowEmpty = false) {
  const name = normalizePersonName(value)
  return (
    (allowEmpty && !name) ||
    (name.length >= 2 && name.length <= 80 && PERSON_NAME_PATTERN.test(name))
  )
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string, allowEmpty = false) {
  const email = normalizeEmail(value)
  return (allowEmpty && !email) || (email.length <= 254 && EMAIL_PATTERN.test(email))
}

export function normalizeBrazilianPhone(value: string) {
  let digits = value.replace(/\D/g, '').replace(/^0/, '')
  if (!digits.startsWith('55')) digits = `55${digits}`
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? `+${digits}` : ''
}

export function normalizeContactIdentifier(value: string) {
  const contact = value.trim()
  if (contact.includes('@')) {
    const email = normalizeEmail(contact)
    return isValidEmail(email) ? ({ kind: 'email', value: email } as const) : null
  }
  const whatsapp = normalizeBrazilianPhone(contact)
  return whatsapp ? ({ kind: 'whatsapp', value: whatsapp } as const) : null
}

export function normalizeInstagramHandle(value: string) {
  let handle = value.trim()
  if (!handle) return ''
  if (/^(?:www\.)?instagram\.com\//i.test(handle)) handle = `https://${handle}`
  if (/^https?:\/\//i.test(handle)) {
    try {
      const profileUrl = new URL(handle)
      if (!['instagram.com', 'www.instagram.com'].includes(profileUrl.hostname.toLowerCase()))
        return ''
      handle = profileUrl.pathname.replace(/^\/+|\/+$/g, '')
    } catch {
      return ''
    }
  }
  handle = handle.replace(/^@/, '')
  return /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : ''
}

export function isValidInstagramHandle(value: string, allowEmpty = false) {
  const handle = value.trim()
  return (
    (allowEmpty && !handle) ||
    (INSTAGRAM_PATTERN.test(handle) && !handle.includes('..') && !handle.endsWith('.'))
  )
}

export function isValidBirthDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date + 'T00:00:00.000Z')
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date >= '1900-01-01' &&
    date <= new Date().toISOString().slice(0, 10)
  )
}

export function isValidProfileSlug(value: string) {
  const slug = value.trim().toLowerCase()
  return PROFILE_SLUG_PATTERN.test(slug) && !reservedProfileSlugs.has(slug)
}

export function isValidLooseCref(value: string, allowEmpty = true) {
  const cref = value.trim()
  return (allowEmpty && !cref) || LOOSE_CREF_PATTERN.test(cref)
}

export function isValidFormattedCref(value: string, allowEmpty = true) {
  const cref = value.trim().toUpperCase()
  return (allowEmpty && !cref) || FORMATTED_CREF_PATTERN.test(cref)
}

export function isValidAge(value: string | number, minimum = 15, maximum = 100) {
  const text = String(value).trim()
  if (!text) return false
  const age = Number(text)
  return Number.isInteger(age) && age >= minimum && age <= maximum
}
