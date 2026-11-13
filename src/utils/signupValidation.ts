export function normalizeBrazilianPhone(value: string) {
  let digits = value.replace(/\D/g, '').replace(/^0/, '')
  if (!digits.startsWith('55')) digits = `55${digits}`
  return /^55[1-9]{2}9?\d{8}$/.test(digits) ? `+${digits}` : ''
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
