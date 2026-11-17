const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function formatDateForInput(value: string) {
  const match = ISO_DATE.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

export function parseDateInput(value: string, min = '1900-01-01', max = '') {
  const match = DISPLAY_DATE.exec(value.trim())
  if (!match) return ''
  const [, day, month, year] = match
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  if (!isRealDate(numericYear, numericMonth, numericDay)) return ''
  const isoDate = `${year}-${month}-${day}`
  if (min && isoDate < min) return ''
  if (max && isoDate > max) return ''
  return isoDate
}

export function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function localTodayIso() {
  const today = new Date()
  const year = String(today.getFullYear()).padStart(4, '0')
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
