import { apiError, requestApi } from './http/apiClient'
import type { CustomerRequest } from '../types/domain'

export type RequestVisibilityAction = 'deactivate' | 'reactivate'

export async function listCustomerRequests(token: string): Promise<CustomerRequest[]> {
  const response = await requestApi<{ requests?: CustomerRequest[]; error?: string }>(
    '/api/customers/requests',
    { token },
  )
  if (!response.ok || !Array.isArray(response.body.requests))
    throw apiError(response, 'Não foi possível carregar suas solicitações.')
  return response.body.requests
}

export async function sendCustomerRequestToTrainers(
  token: string,
  requestId: string,
  trainerIds: string[],
) {
  const response = await requestApi<{ sent?: boolean; added?: number; error?: string }>(
    `/api/requests/${encodeURIComponent(requestId)}/send-to-trainers`,
    { method: 'POST', token, body: { trainerIds } },
  )
  if (!response.ok || !response.body.sent)
    throw apiError(response, 'Não foi possível enviar a solicitação.')
  return response.body.added
}

export async function updateCustomerRequestVisibility(
  token: string,
  requestId: string,
  action: RequestVisibilityAction,
) {
  const response = await requestApi<{ updated?: boolean; error?: string }>(
    `/api/requests/${encodeURIComponent(requestId)}/visibility`,
    { method: 'POST', token, body: { action } },
  )
  if (!response.ok || !response.body.updated)
    throw apiError(response, 'Não foi possível atualizar a solicitação.')
}

export async function acceptCustomerProposal(token: string, requestId: string, trainerId: string) {
  const response = await requestApi<{ accepted?: boolean; error?: string }>(
    `/api/requests/${encodeURIComponent(requestId)}/accept`,
    { method: 'POST', token, body: { trainerId } },
  )
  if (!response.ok || response.body.accepted !== true)
    throw apiError(response, 'Não foi possível aceitar esta proposta.')
}
