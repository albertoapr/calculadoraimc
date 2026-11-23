export const ACADEMY_SLUG_MAX_LENGTH = 80
export const ACADEMY_SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*'
const slugPattern = new RegExp(`^${ACADEMY_SLUG_PATTERN}$`)

export function isAcademySlug(value: string) {
  return value.length <= ACADEMY_SLUG_MAX_LENGTH && slugPattern.test(value)
}

export function suggestAcademySlug(name: string, neighborhood: string) {
  return [name.replace(/^academia\s+/i, ''), neighborhood]
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
    )
    .filter(Boolean)
    .join('-')
    .slice(0, ACADEMY_SLUG_MAX_LENGTH)
    .replace(/-$/, '')
}
