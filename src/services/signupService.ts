import type { AcademyWrite } from './academiesService'
import { apiError, requestApi } from './http/apiClient'

export type CustomerSignupInput = {
  name: string
  whatsapp?: string
  email: string
  sessionToken?: string
  sex: 'masculino' | 'feminino'
  heightCm?: number
  googleCredential?: string
}
export type TrainerSignupInput = {
  name: string
  sex: string
  slug?: string
  whatsapp: string
  dateOfBirth?: string
  email?: string
  cities: string[]
  academias: string[]
  academyIds?: string[]
  newAcademies?: AcademyWrite[]
  instagram: string
  cref?: string
  referralCode?: string
  googleCredential?: string
}

type CustomerSignupResponse = {
  registered?: boolean
  verificationCode?: string
  googleOnly?: boolean
  error?: string
}

export async function registerCustomer(payload: CustomerSignupInput, signal?: AbortSignal) {
  const response = await requestApi<CustomerSignupResponse>('/api/customers/register', {
    method: 'POST',
    signal,
    body: payload,
  })
  if (!response.ok || response.body.registered !== true || (!response.body.verificationCode && !response.body.googleOnly))
    throw apiError(response, 'Não foi possível registrar o cadastro agora.')
  return response.body.googleOnly ? '' : (response.body.verificationCode ?? '')
}

export async function queryCustomerSignup(
  code: string,
  whatsapp: string,
  sessionToken: string,
  signal?: AbortSignal,
) {
  const response = await requestApi<{
    verified?: boolean
    expired?: boolean
    authenticated?: boolean
    name?: string
    whatsapp?: string
    email?: string
    dateOfBirth?: string
    isAdmin?: boolean
    error?: string
  }>('/api/customers/verification-status', {
    method: 'POST',
    signal,
    body: { code, whatsapp, sessionToken },
  })
  return { ok: response.ok, body: response.body }
}

export async function redeemBetaTrainerSignup(code: string) {
  const response = await requestApi<{
    started?: boolean
    sessionToken?: string
    whatsapp?: string
    name?: string
    expiresAt?: number
    city?: string
    sexHint?: string
    academyMatch?: string
    academyName?: string
    proposedAcademyName?: string
    proposedNeighborhood?: string
    error?: string
  }>('/api/auth/beta-trainer-signup/redeem', { method: 'POST', body: { code } })
  if (!response.ok || !response.body.started || !response.body.sessionToken ||
      !response.body.whatsapp)
    throw apiError(response, 'Este link não é mais válido. Solicite outro à Beta.')
  return response.body as {
    started: true; sessionToken: string; whatsapp: string; name?: string; expiresAt?: number
    city?: string; sexHint?: string; academyMatch?: string; academyName?: string
    proposedAcademyName?: string; proposedNeighborhood?: string
  }
}

export async function completeBetaTrainerSignup(
  payload: TrainerSignupInput & { onboardingSessionToken: string },
  signal?: AbortSignal,
) {
  const response = await requestApi<{
    registered?: boolean
    sessionToken?: string
    slug?: string
    error?: string
  }>('/api/auth/beta-trainer-signup/complete', { method: 'POST', body: payload, signal })
  if (!response.ok || !response.body.registered || !response.body.sessionToken)
    throw apiError(response, 'Não foi possível concluir o cadastro do personal.')
  return response.body.sessionToken
}

export async function registerTrainer(payload: TrainerSignupInput, signal?: AbortSignal) {
  const response = await requestApi<{
    registered?: boolean
    verificationCode?: string
    browserToken?: string
    expiresAt?: number
    slug?: string
    error?: string
  }>('/api/trainers/register', {
    method: 'POST',
    signal,
    body: payload,
  })
  if (!response.ok || response.body.registered !== true)
    throw apiError(response, 'Não foi possível registrar seu cadastro agora.')
  if (!response.body.verificationCode)
    throw new Error(
      'Cadastro recebido, mas não foi possível gerar o código de confirmação. Tente novamente.',
    )
  return {
    verificationCode: response.body.verificationCode,
    slug: response.body.slug,
    browserToken: response.body.browserToken,
    expiresAt: response.body.expiresAt,
  }
}

export async function queryTrainerSignup(code: string, browserToken: string, signal?: AbortSignal) {
  return requestApi<{ authenticated?: boolean; expired?: boolean; error?: string }>('/api/trainers/verification-status', {
    method: 'POST', body: { code, browserToken }, signal,
  })
}
