import { apiError, requestApi } from './http/apiClient'

export type AdminCustomer = {
  customerId: string
  userId: string
  name: string
  email: string
  whatsapp: string
  whatsappVerified: boolean
  dateOfBirth: string
  sex: string
  heightCm: number | null
  active: boolean
  hasLegacy: boolean
}

export type AdminCustomerUpdate = {
  name: string
  dateOfBirth: string
  sex: '' | 'masculino' | 'feminino'
  heightCm?: number
  active: boolean
}

export async function listAdminCustomers(token: string): Promise<AdminCustomer[]> {
  const response = await requestApi<{ customers?: AdminCustomer[]; error?: string }>(
    '/api/admin/customers', { token },
  )
  if (!response.ok || !Array.isArray(response.body.customers))
    throw apiError(response, 'Não foi possível consultar os clientes.')
  return response.body.customers
}

export async function updateAdminCustomer(
  token: string, id: string, data: AdminCustomerUpdate,
): Promise<void> {
  const response = await requestApi<{ updated?: boolean; error?: string }>(
    `/api/admin/customers/${encodeURIComponent(id)}`,
    { method: 'PUT', token, body: data },
  )
  if (!response.ok || !response.body.updated)
    throw apiError(response, 'Não foi possível atualizar o cliente.')
}
