import { getRequestApiEndpoint } from './api'
import type { TrainerRequestDetails } from '../types/domain'

export async function getTrainerRequest(token: string): Promise<TrainerRequestDetails> {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(
    `${endpoint}/api/requests/trainer-view?token=${encodeURIComponent(token)}`,
    {
      cache: 'no-store',
    },
  )
  const body = (await response.json()) as {
    request?: TrainerRequestDetails
    expired?: boolean
    error?: string
  }
  if (response.status === 410 || body.expired)
    throw new Error('Esta solicitação expirou e não pode mais ser visualizada.')
  if (!response.ok || !body.request) throw new Error(body.error || 'Solicitação indisponível.')
  return body.request
}

export async function sendTrainerProposal(proposal: {
  token: string
  monthlyPrice: number
  message: string
}) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/requests/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(proposal),
  })
  const body = (await response.json()) as { submitted?: boolean; error?: string }
  if (!response.ok || body.submitted !== true)
    throw new Error(body.error || 'Não foi possível enviar a proposta.')
}
