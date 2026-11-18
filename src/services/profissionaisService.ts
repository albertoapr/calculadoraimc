import { apiError, requestApi } from './http/apiClient'

export type PublicTrainer = {
  trainerId: string
  googlePhotoUrl?: string
  name: string
  slug: string
  instagram?: string
  cref?: string
  sex?: string
  gender?: string
  academias?: string[]
  academyIds?: string[]
  gymName?: string
  academy?: string
}

export type TrainerGenderPreference = 'indiferente' | 'feminino' | 'masculino'

const CACHE_TTL_MS = 90_000
const trainerCache = new Map<string, { expiresAt: number; trainers: PublicTrainer[] }>()
const inFlight = new Map<string, Promise<PublicTrainer[]>>()

export function getCachedEligibleTrainers(
  city: string,
  gender: TrainerGenderPreference,
): PublicTrainer[] | undefined {
  const entry = trainerCache.get(JSON.stringify([city, gender]))
  return entry && entry.expiresAt > Date.now() ? entry.trainers : undefined
}

export function listEligibleTrainers(
  city: string,
  gender: TrainerGenderPreference,
): Promise<PublicTrainer[]> {
  const key = JSON.stringify([city, gender])
  const cached = getCachedEligibleTrainers(city, gender)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(key)
  if (existing) return existing

  const loading = (async () => {
    const response = await requestApi<{ trainers?: PublicTrainer[]; error?: string }>(
      '/api/trainers/eligible',
      { query: { city, gender } },
    )
    if (!response.ok) throw apiError(response, 'Não foi possível consultar os profissionais.')
    if (!Array.isArray(response.body.trainers))
      throw new Error('Resposta inválida ao consultar profissionais.')
    trainerCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      trainers: response.body.trainers,
    })
    return response.body.trainers
  })()
  inFlight.set(key, loading)
  void loading.finally(() => inFlight.delete(key)).catch(() => undefined)
  return loading
}

export async function getPublicTrainerProfile(
  identity: { slug: string } | { trainerId: string },
): Promise<PublicTrainer> {
  const path: `/api/${string}` =
    'slug' in identity
      ? `/api/trainers/by-slug/${encodeURIComponent(identity.slug)}`
      : `/api/trainers/${encodeURIComponent(identity.trainerId)}`
  const response = await requestApi<{ trainer?: PublicTrainer; error?: string }>(path)
  if (!response.ok || !response.body.trainer)
    throw apiError(response, 'Perfil do personal indisponível.')
  return response.body.trainer
}
