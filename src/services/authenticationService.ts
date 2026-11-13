import { getRequestApiEndpoint } from './api'
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
  path: string,
  init: RequestInit,
): Promise<AuthenticationResponse<T>> {
  const endpoint = await getRequestApiEndpoint(init.signal ?? undefined)
  if (init.signal?.aborted) throw new Error('Request canceled')
  const response = await fetch(endpoint + path, init)
  return { ok: response.ok, body: (await response.json()) as T }
}

export function startWhatsAppSession(
  role: LoginRole,
  payload: { whatsapp: string; sessionToken: string },
) {
  return requestAuthentication<WhatsAppSessionStart>(
    `/api/${role === 'trainer' ? 'trainers' : 'customers'}/login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export function queryWhatsAppSession(
  role: LoginRole,
  payload: { whatsapp: string; code: string; sessionToken: string },
  signal: AbortSignal,
) {
  return requestAuthentication<LoginStatus>(
    `/api/${role === 'trainer' ? 'trainers' : 'customers'}/login-status`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  )
}

export function startEmailSession(payload: {
  email: string
  sessionToken: string
  asTrainer: boolean
}) {
  return requestAuthentication<{ started?: boolean; error?: string }>(
    '/api/customers/start-email-login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export function queryEmailSession(sessionToken: string, role: LoginRole) {
  return requestAuthentication<LoginStatus>('/api/customers/email-login-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ sessionToken, role }),
  })
}

export function verifyEmailSession(code: string) {
  return requestAuthentication<EmailVerification>(
    '/api/customers/verify-email-login?code=' + encodeURIComponent(code),
    {
      method: 'POST',
      cache: 'no-store',
    },
  )
}

export async function loadCustomerProfile(token: string, signal?: AbortSignal) {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(`${endpoint}/api/customers/profile`, {
    signal,
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const body = (await response.json()) as {
    authenticated?: boolean
    profile?: CustomerAccountProfile
    error?: string
  }
  if (!response.ok || body.authenticated !== true || !body.profile) {
    throw new Error(body.error || 'Não foi possível carregar seu cadastro.')
  }
  return body.profile
}

export async function loadTrainerSession(
  token: string,
  signal?: AbortSignal,
): Promise<TrainerAccountProfile> {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(endpoint + '/api/trainers/profile', {
    signal,
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    cache: 'no-store',
  })
  const body = (await response.json()) as {
    authenticated?: boolean
    profile?: TrainerAccountProfile
    error?: string
  }
  if (!response.ok || body.authenticated !== true || !body.profile?.trainerId)
    throw new Error(body.error || 'Sessão inválida.')
  return body.profile
}
