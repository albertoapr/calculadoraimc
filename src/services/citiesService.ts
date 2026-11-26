import { apiError, requestApi } from './http/apiClient'

export type City = {
  cityId: string
  cityKey: string
  name: string
  state: string
  slug: string
  active: boolean
  minimumHourlyRateCents: number | null
  averageHourlyRateCents: number | null
  pricesUpdatedAt: string | null
  updatedAt?: string
}

export type CityWrite = Pick<City,
  'name' | 'state' | 'active' | 'minimumHourlyRateCents' | 'averageHourlyRateCents' | 'updatedAt'
>

export async function listCities(scope: 'public' | 'registration' | 'admin', token?: string) {
  const response = await requestApi<{ cities?: City[]; error?: string }>(
    scope === 'admin' ? '/api/admin/cities' : '/api/cities',
    { token, query: scope === 'registration' ? { scope } : undefined },
  )
  if (!response.ok || !Array.isArray(response.body?.cities))
    throw apiError(response, 'Não foi possível carregar as cidades.')
  return response.body.cities
}

export async function saveCity(city: CityWrite, token: string, cityId?: string) {
  const response = await requestApi<{ city?: City; error?: string }>(
    cityId ? `/api/admin/cities/${encodeURIComponent(cityId)}` : '/api/admin/cities',
    { method: cityId ? 'PUT' : 'POST', token, body: city },
  )
  if (!response.ok || !response.body?.city)
    throw apiError(response, 'Não foi possível salvar a cidade.')
  return response.body.city
}

export type CityRequestStatus = 'PENDING' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'AVAILABLE' | 'UNAVAILABLE'
export type CityRequest = { requestId: string; name: string; state: string; status: CityRequestStatus; createdAt: string; updatedAt: string; cityId: string }

export async function suggestCity(name: string, state: string) {
  const response = await requestApi<{ status?: CityRequestStatus; city?: City; error?: string }>('/api/cities/requests', { method: 'POST', body: { name, state } })
  if (!response.ok || !response.body.status) throw apiError(response, 'Não foi possível solicitar a cidade.')
  return response.body as { status: CityRequestStatus; city?: City }
}

export async function listCityRequests(token: string) {
  const response = await requestApi<{ requests?: CityRequest[]; error?: string }>('/api/admin/city-requests', { token })
  if (!response.ok || !Array.isArray(response.body.requests)) throw apiError(response, 'Não foi possível carregar as solicitações.')
  return response.body.requests
}

export async function reviewCityRequest(request: CityRequest, action: 'approve' | 'reject', token: string) {
  const response = await requestApi<{ reviewed?: boolean; error?: string }>(`/api/admin/city-requests/${encodeURIComponent(request.requestId)}`, { method: 'PUT', token, body: { action, updatedAt: request.updatedAt } })
  if (!response.ok || !response.body.reviewed) throw apiError(response, 'Não foi possível analisar a solicitação.')
}
