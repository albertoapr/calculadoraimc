import { loadCustomerProfile, loadTrainerSession } from './authenticationService'
import { getRequestApiEndpoint } from './api'
import type { CustomerAccountProfile, TrainerAccountProfile } from '../types/domain'

export type AccountProfileType = 'customer' | 'trainer'
export type AccountProfile = CustomerAccountProfile | TrainerAccountProfile

export function loadAccountProfile(
  type: AccountProfileType,
  token: string,
): Promise<AccountProfile> {
  return type === 'trainer' ? loadTrainerSession(token) : loadCustomerProfile(token)
}

export async function updateAccountProfile(
  type: AccountProfileType,
  token: string,
  payload:
    | { name: string; dateOfBirth?: string }
    | {
        name: string
        dateOfBirth: string
        instagram: string
        cref: string
        academias: string[]
      },
): Promise<AccountProfile> {
  const endpoint = await getRequestApiEndpoint()
  const resource = type === 'trainer' ? 'trainers' : 'customers'
  const response = await fetch(`${endpoint}/api/${resource}/update-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    cache: 'no-store',
    body: JSON.stringify(payload),
  })
  const body = (await response.json()) as {
    authenticated?: boolean
    profile?: AccountProfile
    error?: string
  }
  if (!response.ok || !body.authenticated || !body.profile)
    throw new Error(body.error || 'Não foi possível salvar o cadastro.')
  return body.profile
}
