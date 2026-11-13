import { getRequestApiEndpoint } from './api'

export type CustomerSignupInput = { name: string; whatsapp: string; email: string }
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

export async function registerCustomer(payload: CustomerSignupInput, signal?: AbortSignal) {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(`${endpoint}/api/customers/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify(payload),
  })
  const body = (await response.json()) as {
    registered?: boolean
    verificationCode?: string
    error?: string
  }
  if (!response.ok || body.registered !== true || !body.verificationCode)
    throw new Error(body.error || 'Não foi possível registrar o cadastro agora.')
  return body.verificationCode
}

export async function queryCustomerSignup(code: string, whatsapp: string, signal?: AbortSignal) {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(`${endpoint}/api/customers/verification-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({ code, whatsapp }),
  })
  const body = (await response.json()) as {
    verified?: boolean
    expired?: boolean
    name?: string
    error?: string
  }
  return { ok: response.ok, body }
}

export async function registerTrainer(payload: TrainerSignupInput, signal?: AbortSignal) {
  const endpoint = await getRequestApiEndpoint(signal)
  const response = await fetch(`${endpoint}/api/trainers/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify(payload),
  })
  const body = (await response.json()) as {
    registered?: boolean
    verificationCode?: string
    slug?: string
    error?: string
  }
  if (!response.ok || body.registered !== true)
    throw new Error(body.error || 'Não foi possível registrar seu cadastro agora.')
  if (!body.verificationCode)
    throw new Error(
      'Cadastro recebido, mas não foi possível gerar o código de confirmação. Tente novamente.',
    )
  return { verificationCode: body.verificationCode, slug: body.slug }
}
