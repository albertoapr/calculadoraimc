import { getRequestApiEndpoint } from './api'

export type PublicTrainer = {
  trainerId: string
  name: string
  slug: string
  instagram?: string
  cref?: string
  sex?: string
  gender?: string
  academias?: string[]
  gymName?: string
  academy?: string
}

export type TrainerGenderPreference = 'indiferente' | 'feminino' | 'masculino'

/**
 * Evita consultas repetidas durante o fluxo resumo -> seleção -> resumo.
 * Compartilha requisições simultâneas e mantém o resultado por 90 segundos.
 */
const CACHE_TTL_MS = 90_000
const trainerCache = new Map<string, { expiresAt: number; trainers: PublicTrainer[] }>()
const inFlight = new Map<string, Promise<PublicTrainer[]>>()

export function getCachedEligibleTrainers(city: string, gender: TrainerGenderPreference): PublicTrainer[] | undefined {
  const entry = trainerCache.get(JSON.stringify([city, gender]))
  return entry && entry.expiresAt > Date.now() ? entry.trainers : undefined
}

/** Fetch eligible professionals for a city and an optional gender preference. */
export function listEligibleTrainers(city: string, gender: TrainerGenderPreference): Promise<PublicTrainer[]> {
  const key = JSON.stringify([city, gender])
  const cached = getCachedEligibleTrainers(city, gender)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(key)
  if (existing) return existing

  const loading = (async () => {
    const endpoint = await getRequestApiEndpoint()
    const query = new URLSearchParams({ city, gender })
    const response = await fetch(`${endpoint}/api/trainers/eligible?${query}`)
    if (!response.ok) throw new Error('Não foi possível consultar os profissionais.')
    const body = await response.json() as { trainers?: PublicTrainer[] }
    if (!Array.isArray(body.trainers)) throw new Error('Resposta inválida ao consultar profissionais.')
    trainerCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, trainers: body.trainers })
    return body.trainers
  })()
  inFlight.set(key, loading)
  void loading.then(() => { inFlight.delete(key) }, () => { inFlight.delete(key) })
  return loading
}
