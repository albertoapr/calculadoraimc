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

/** Fetch eligible professionals for a city and an optional gender preference. */
export async function listEligibleTrainers(city: string, gender: TrainerGenderPreference): Promise<PublicTrainer[]> {
  const endpoint = await getRequestApiEndpoint()
  const query = new URLSearchParams({ city, gender })
  const response = await fetch(`${endpoint}/api/trainers/eligible?${query}`)
  if (!response.ok) throw new Error('Não foi possível consultar os profissionais.')
  const body = await response.json() as { trainers?: PublicTrainer[] }
  if (!Array.isArray(body.trainers)) throw new Error('Resposta inválida ao consultar profissionais.')
  return body.trainers
}
