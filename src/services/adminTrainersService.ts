import { getRequestApiEndpoint } from './api'
import type { AdminTrainer } from '../types/domain'

export type AdminTrainerWrite = Omit<AdminTrainer, 'trainerId' | 'active'> & { active?: boolean }

export async function registerAdminTrainer(token: string, trainer: AdminTrainerWrite) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/admin/trainers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(trainer),
  })
  const body = (await response.json()) as { registered?: boolean; error?: string }
  if (!response.ok || !body.registered)
    throw new Error(body.error || 'Não foi possível cadastrar o profissional.')
}

export async function listAdminTrainers(token: string): Promise<AdminTrainer[]> {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/admin/trainers`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const body = (await response.json()) as { trainers?: AdminTrainer[]; error?: string }
  if (!response.ok || !Array.isArray(body.trainers))
    throw new Error(body.error || 'Não foi possível carregar os profissionais.')
  return body.trainers
}

export async function updateAdminTrainer(
  token: string,
  trainerId: string,
  trainer: AdminTrainerWrite,
) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/admin/trainers/${encodeURIComponent(trainerId)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(trainer),
  })
  const body = (await response.json()) as { updated?: boolean; error?: string }
  if (!response.ok || !body.updated)
    throw new Error(body.error || 'Não foi possível salvar o profissional.')
}
