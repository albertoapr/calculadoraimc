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
