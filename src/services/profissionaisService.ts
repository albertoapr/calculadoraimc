import { apiError, requestApi } from './http/apiClient'

export type PublicTrainer = {
  tagline?: string
  aboutMe?: string
  education?: string
  workingMethod?: string
  pricing?: string
  bannerUpdatedAt?: string
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

/** Public API only serves images for active professional accounts. */
export async function getPublicTrainerBanner(trainerId: string): Promise<string> {
  const path: `/api/${string}` = `/api/trainers/banner/${encodeURIComponent(trainerId)}`
  const response = await requestApi<{ imageBase64?: string; error?: string }>(path)
  if (!response.ok || !response.body.imageBase64)
    throw apiError(response, 'Não foi possível carregar a foto do profissional.')
  return 'data:image/jpeg;base64,' + response.body.imageBase64
}

const photoCache = new Map<string, { expiresAt: number; url: string }>()
const pendingPhotos = new Map<string, Promise<string>>()
let photoQueue: Promise<unknown> = Promise.resolve()

/** Resolve only the photo of a displayed trainer, through the existing active-profile endpoint. */
export function getPublicTrainerPhoto(trainerId: string, reference: string): Promise<string> {
  const key = trainerId + ':' + reference
  const cached = photoCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url)
  const pending = pendingPhotos.get(key)
  if (pending) return pending
  const task = photoQueue.catch(() => undefined).then(async () => {
    const profile = await getPublicTrainerProfile({ trainerId })
    const url = profile.googlePhotoUrl ?? ''
    if (url && !url.startsWith('fitpeso-photo:')) {
      if (photoCache.size >= 200) photoCache.delete(photoCache.keys().next().value!)
      photoCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, url })
    }
    return url
  })
  photoQueue = task
  pendingPhotos.set(key, task)
  void task.finally(() => pendingPhotos.delete(key)).catch(() => undefined)
  return task
}
