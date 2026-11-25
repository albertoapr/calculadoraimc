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
    | { name: string; dateOfBirth?: string; sex: 'masculino' | 'feminino'; heightCm?: number }
    | {
        name: string
        dateOfBirth: string
        instagram: string
        cref: string
        academias: string[]
        academyIds: string[]
        tagline?: string
        aboutMe?: string
        education?: string
        workingMethod?: string
        pricing?: string
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

export async function uploadTrainerBanner(token: string, imageBase64: string) {
  const response = await requestApi<{ uploaded?: boolean; bannerUpdatedAt?: string; error?: string }>(
    '/api/trainers/upload-banner',
    { method: 'POST', token, body: { imageBase64 } },
  )
  if (!response.ok || !response.body.uploaded || !response.body.bannerUpdatedAt)
    throw apiError(response, 'Não foi possível enviar o banner.')
  return response.body.bannerUpdatedAt
}

export async function uploadAccountPhoto(type: AccountProfileType, token: string, imageBase64: string) {
  const resource = type === 'trainer' ? 'trainers' : 'customers'
  const response = await requestApi<{ uploaded?: boolean; photoUrl?: string; error?: string }>(
    `/api/${resource}/upload-photo`, { method: 'POST', token, body: { imageBase64 } },
  )
  if (!response.ok || !response.body.uploaded || !response.body.photoUrl)
    throw apiError(response, 'Não foi possível atualizar a foto.')
  return response.body.photoUrl
}
