import { apiError, requestApi } from './http/apiClient'
import type { CustomerAccountProfile, TrainerAccountProfile } from '../types/domain'

export type LoginRole = 'customer' | 'trainer'
type AuthenticationResponse<T> = { ok: boolean; body: T }
type WhatsAppSessionStart = {
  started?: boolean
  verificationCode?: string
  expiresAt?: number
  error?: string
}
type LoginStatus = {
  authenticated?: boolean
  expired?: boolean
  confirmed?: boolean
  error?: string
}
type EmailVerification = {
  authenticated?: boolean
  sessionToken?: string
  role?: string
  error?: string
}

async function requestAuthentication<T>(
  path: `/api/${string}`,
  options: Parameters<typeof requestApi<T>>[1],
): Promise<AuthenticationResponse<T>> {
  const response = await requestApi<T>(path, options)
  return { ok: response.ok, body: response.body }
}

export function startWhatsAppSession(
  role: LoginRole,
  payload: { whatsapp: string; sessionToken: string },
) {
  return requestAuthentication<WhatsAppSessionStart>(
    `/api/${role === 'trainer' ? 'trainers' : 'customers'}/login`,
    { method: 'POST', body: payload },
  )
}

export function queryWhatsAppSession(
  role: LoginRole,
  payload: { whatsapp: string; code: string; sessionToken: string },
  signal: AbortSignal,
) {
  return requestAuthentication<LoginStatus>(
    `/api/${role === 'trainer' ? 'trainers' : 'customers'}/login-status`,
    { method: 'POST', body: payload, signal },
  )
}

export function startEmailSession(payload: {
  email: string
  sessionToken: string
  asTrainer: boolean
}) {
  return requestAuthentication<{ started?: boolean; error?: string }>(
    '/api/customers/start-email-login',
    { method: 'POST', body: payload },
  )
}

export function queryEmailSession(sessionToken: string, role: LoginRole) {
  return requestAuthentication<LoginStatus>('/api/customers/email-login-status', {
    method: 'POST',
    body: { sessionToken, role },
  })
}

export function verifyEmailSession(code: string) {
  return requestAuthentication<EmailVerification>('/api/customers/verify-email-login', {
    method: 'POST',
    query: { code },
  })
}

export async function loadCustomerProfile(token: string, signal?: AbortSignal) {
  const response = await requestApi<{
    authenticated?: boolean
    profile?: CustomerAccountProfile
    error?: string
  }>('/api/customers/profile', { method: 'POST', token, signal })
  if (!response.ok || response.body.authenticated !== true || !response.body.profile)
    throw apiError(response, 'Não foi possível carregar seu cadastro.')
  return response.body.profile
}

export async function loadTrainerSession(
  token: string,
  signal?: AbortSignal,
): Promise<TrainerAccountProfile> {
  const response = await requestApi<{
    authenticated?: boolean
    profile?: TrainerAccountProfile
    error?: string
  }>('/api/trainers/profile', { method: 'POST', token, signal })
  if (!response.ok || response.body.authenticated !== true || !response.body.profile?.trainerId)
    throw apiError(response, 'Sessão inválida.')
  return response.body.profile
}
