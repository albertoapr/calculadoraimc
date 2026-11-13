import { getRequestApiEndpoint } from './api'
import type { CustomerRequest } from '../types/domain'

export type RequestVisibilityAction = 'deactivate' | 'reactivate'

export async function listCustomerRequests(token: string): Promise<CustomerRequest[]> {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/customers/requests`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const body = (await response.json()) as { requests?: CustomerRequest[]; error?: string }
  if (!response.ok || !Array.isArray(body.requests))
    throw new Error(body.error || 'Não foi possível carregar suas solicitações.')
  return body.requests
}

export async function sendCustomerRequestToTrainers(
  token: string,
  requestId: string,
  trainerIds: string[],
) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(
    `${endpoint}/api/requests/${encodeURIComponent(requestId)}/send-to-trainers`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ trainerIds }),
    },
  )
  const body = (await response.json()) as { sent?: boolean; added?: number; error?: string }
  if (!response.ok || !body.sent)
    throw new Error(body.error || 'Não foi possível enviar a solicitação.')
  return body.added
}

export async function updateCustomerRequestVisibility(
  token: string,
  requestId: string,
  action: RequestVisibilityAction,
) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(
    `${endpoint}/api/requests/${encodeURIComponent(requestId)}/visibility`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    },
  )
  const body = (await response.json()) as { updated?: boolean; error?: string }
  if (!response.ok || !body.updated)
    throw new Error(body.error || 'Não foi possível atualizar a solicitação.')
}

export async function acceptCustomerProposal(token: string, requestId: string, trainerId: string) {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}/api/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ trainerId }),
  })
  const body = (await response.json()) as { accepted?: boolean; error?: string }
  if (!response.ok || body.accepted !== true)
    throw new Error(body.error || 'Não foi possível aceitar esta proposta.')
}
