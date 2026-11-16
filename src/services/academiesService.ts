import { getRequestApiEndpoint } from './api'

export type Academy = {
  academyId: string
  name: string
  city: string
  neighborhood: string
  state: string
  address: string
  zipCode: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AcademyWrite = Pick<
  Academy,
  'name' | 'city' | 'neighborhood' | 'address' | 'zipCode' | 'active'
>

async function academyRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const endpoint = await getRequestApiEndpoint()
  const response = await fetch(`${endpoint}${path}`, { cache: 'no-store', ...options })
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Não foi possível consultar as academias.')
  return body
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

export async function listAcademies(city?: string): Promise<Academy[]> {
  const query = city ? `?city=${encodeURIComponent(city)}` : ''
  const data = await academyRequest<{ academies: Academy[] }>(`/api/academies${query}`)
  if (!Array.isArray(data.academies)) throw new Error('Resposta inválida ao listar academias.')
  return data.academies
}

export async function listAdminAcademies(token: string): Promise<Academy[]> {
  const data = await academyRequest<{ academies: Academy[] }>('/api/admin/academies', {
    headers: authHeaders(token),
  })
  if (!Array.isArray(data.academies)) throw new Error('Resposta inválida ao listar academias.')
  return data.academies
}

export async function createAdminAcademy(token: string, academy: AcademyWrite) {
  return academyRequest<{ created: boolean; academyId: string }>('/api/admin/academies', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(academy),
  })
}

export async function updateAdminAcademy(token: string, academyId: string, academy: AcademyWrite) {
  return academyRequest<{ updated: boolean }>(
    `/api/admin/academies/${encodeURIComponent(academyId)}`,
    { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(academy) },
  )
}

export async function deactivateAdminAcademy(token: string, academyId: string) {
  return academyRequest<{ deactivated: boolean }>(
    `/api/admin/academies/${encodeURIComponent(academyId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  )
}
