import { apiError, requestApi } from './http/apiClient'

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

export async function listAcademies(city?: string): Promise<Academy[]> {
  const response = await requestApi<{ academies?: Academy[]; error?: string }>(
    '/api/academies',
    { query: { city } },
  )
  if (!response.ok) throw apiError(response, 'Não foi possível consultar as academias.')
  if (!Array.isArray(response.body.academies))
    throw new Error('Resposta inválida ao listar academias.')
  return response.body.academies
}

export async function listAdminAcademies(token: string): Promise<Academy[]> {
  const response = await requestApi<{ academies?: Academy[]; error?: string }>(
    '/api/admin/academies',
    { token },
  )
  if (!response.ok) throw apiError(response, 'Não foi possível consultar as academias.')
  if (!Array.isArray(response.body.academies))
    throw new Error('Resposta inválida ao listar academias.')
  return response.body.academies
}

export async function createAdminAcademy(token: string, academy: AcademyWrite) {
  const response = await requestApi<{ created: boolean; academyId: string; error?: string }>(
    '/api/admin/academies',
    { method: 'POST', token, body: academy },
  )
  if (!response.ok) throw apiError(response, 'Não foi possível cadastrar a academia.')
  return response.body
}

export async function updateAdminAcademy(
  token: string,
  academyId: string,
  academy: AcademyWrite,
) {
  const response = await requestApi<{ updated: boolean; error?: string }>(
    `/api/admin/academies/${encodeURIComponent(academyId)}`,
    { method: 'PUT', token, body: academy },
  )
  if (!response.ok) throw apiError(response, 'Não foi possível salvar a academia.')
  return response.body
}

export async function deactivateAdminAcademy(token: string, academyId: string) {
  const response = await requestApi<{ deactivated: boolean; error?: string }>(
    `/api/admin/academies/${encodeURIComponent(academyId)}`,
    { method: 'DELETE', token },
  )
  if (!response.ok) throw apiError(response, 'Não foi possível desativar a academia.')
  return response.body
}
