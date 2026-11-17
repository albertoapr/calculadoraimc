import { loadCustomerProfile, loadTrainerSession } from './authenticationService'
import { apiError, requestApi } from './http/apiClient'
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
  const resource = type === 'trainer' ? 'trainers' : 'customers'
  const response = await requestApi<{
    authenticated?: boolean
    profile?: AccountProfile
    error?: string
  }>(`/api/${resource}/update-profile`, {
    method: 'POST',
    token,
    body: payload,
  })
  if (!response.ok || !response.body.authenticated || !response.body.profile)
    throw apiError(response, 'Não foi possível salvar o cadastro.')
  return response.body.profile
}
