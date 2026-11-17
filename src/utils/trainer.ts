/** Presentation helpers shared by public directory and request selection. */
export function trainerDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] || ''
}

export function trainerInstagramUrl(instagram: string): string {
  const handle = instagram
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0]
  return /^[-._a-zA-Z0-9]+$/.test(handle) ? `https://www.instagram.com/${handle}/` : ''
}
