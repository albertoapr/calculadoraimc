import { apiError, requestApi } from './http/apiClient'
import type { AdminTrainer } from '../types/domain'

export type AdminTrainerWrite = Omit<AdminTrainer, 'trainerId' | 'active'> & { active?: boolean }

export async function registerAdminTrainer(token: string, trainer: AdminTrainerWrite) {
  const response = await requestApi<{ registered?: boolean; error?: string }>(
    '/api/admin/trainers',
    { method: 'POST', token, body: trainer },
  )
  if (!response.ok || !response.body.registered)
    throw apiError(response, 'Não foi possível cadastrar o profissional.')
}

export async function listAdminTrainers(token: string): Promise<AdminTrainer[]> {
  const response = await requestApi<{ trainers?: AdminTrainer[]; error?: string }>(
    '/api/admin/trainers',
    { token },
  )
  if (!response.ok || !Array.isArray(response.body.trainers))
    throw apiError(response, 'Não foi possível carregar os profissionais.')
  return response.body.trainers
}

export async function updateAdminTrainer(
  token: string,
  trainerId: string,
  trainer: AdminTrainerWrite,
) {
  const response = await requestApi<{ updated?: boolean; error?: string }>(
    `/api/admin/trainers/${encodeURIComponent(trainerId)}`,
    { method: 'PUT', token, body: trainer },
  )
  if (!response.ok || !response.body.updated)
    throw apiError(response, 'Não foi possível salvar o profissional.')
}
