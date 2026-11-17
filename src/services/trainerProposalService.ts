import { apiError, requestApi } from './http/apiClient'
import type { TrainerRequestDetails } from '../types/domain'

export async function getTrainerRequest(token: string): Promise<TrainerRequestDetails> {
  const response = await requestApi<{
    request?: TrainerRequestDetails
    expired?: boolean
    error?: string
  }>('/api/requests/trainer-view', { query: { token } })
  if (response.status === 410 || response.body.expired)
    throw new Error('Esta solicitação expirou e não pode mais ser visualizada.')
  if (!response.ok || !response.body.request)
    throw apiError(response, 'Solicitação indisponível.')
  return response.body.request
}

export async function sendTrainerProposal(proposal: {
  token: string
  monthlyPrice: number
  message: string
}) {
  const response = await requestApi<{ submitted?: boolean; error?: string }>(
    '/api/requests/proposals',
    { method: 'POST', body: proposal },
  )
  if (!response.ok || response.body.submitted !== true)
    throw apiError(response, 'Não foi possível enviar a proposta.')
}
