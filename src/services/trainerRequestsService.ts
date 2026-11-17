import { apiError, requestApi } from './http/apiClient'
import type { TrainerReceivedRequest } from '../types/domain'

export async function listTrainerReceivedRequests(
  token: string,
): Promise<TrainerReceivedRequest[]> {
  const response = await requestApi<{ requests?: TrainerReceivedRequest[]; error?: string }>(
    '/api/trainers/received-requests',
    { token },
  )
  if (!response.ok || !Array.isArray(response.body.requests))
    throw apiError(response, 'Não foi possível carregar as solicitações.')
  return response.body.requests
}
