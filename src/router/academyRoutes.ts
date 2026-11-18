/** Rotas públicas legíveis para academias: /cidade/academia/nome/bairro. */
export function academySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function academyPath(city: string, name: string, neighborhood: string): string {
  const citySlug = academySlug(city)
  const nameSlug = academySlug(name.replace(/^academia\s+/i, ''))
  const neighborhoodSlug = academySlug(neighborhood)
  if (!citySlug || !nameSlug) return '/profissionais'
  const prefix = `/${citySlug}/academia/${nameSlug}`
  // Cadastros legados sem bairro continuam acessíveis sem criar um bairro fictício.
  return neighborhoodSlug ? `${prefix}/${neighborhoodSlug}` : prefix
}

export function parseAcademyPath(path: string) {
  const match = /^\/([a-z0-9-]+)\/academia\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/i.exec(path)
  if (!match) return null
  return {
    city: match[1]!.toLowerCase(),
    name: match[2]!.toLowerCase(),
    neighborhood: (match[3] ?? '').toLowerCase(),
  }
}
