import { apiError, requestApi } from './http/apiClient'

export type CustomerSignupInput = {
  name: string
  whatsapp: string
  email: string
  sessionToken: string
  sex: 'masculino' | 'feminino'
  heightCm?: number
}
export type TrainerSignupInput = {
  name: string
  sex: string
  slug: string
  whatsapp: string
  dateOfBirth?: string
  email?: string
  cities: string[]
  academias: string[]
  instagram: string
  cref?: string
}

type CustomerSignupResponse = {
  registered?: boolean
  verificationCode?: string
  error?: string
}

export async function registerCustomer(payload: CustomerSignupInput, signal?: AbortSignal) {
  const response = await requestApi<CustomerSignupResponse>('/api/customers/register', {
    method: 'POST',
    signal,
    body: payload,
  })
  if (!response.ok || response.body.registered !== true || !response.body.verificationCode)
    throw apiError(response, 'Não foi possível registrar o cadastro agora.')
  return response.body.verificationCode
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

export async function registerTrainer(payload: TrainerSignupInput, signal?: AbortSignal) {
  const response = await requestApi<{
    registered?: boolean
    verificationCode?: string
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
  }
}
