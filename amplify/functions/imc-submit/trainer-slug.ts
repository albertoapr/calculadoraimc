const reserved = new Set(['www', 'api', 'mail', 'ftp', 'admin', 'app', 'beta', 'fitpeso', 'suporte', 'ajuda', 'develop', 'test', 'homologacao'])

export function validTrainerSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(value) && !reserved.has(value)
}

export function trainerSlugCandidate(name: string, ordinal = 1): string {
  let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (base.length < 3) base = 'personal' + (base ? '-' + base : '')
  if (reserved.has(base)) base += '-personal'
  const suffix = ordinal > 1 ? '-' + ordinal : ''
  base = base.slice(0, 40 - suffix.length).replace(/-+$/g, '')
  return base + suffix
}
