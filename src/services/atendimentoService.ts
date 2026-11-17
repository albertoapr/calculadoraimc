import { apiError, requestApi } from './http/apiClient'

export async function createFitpesoRequest(request: Record<string, unknown>, token: string) {
  if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
  const response = await requestApi<{
    created?: boolean
    requestId?: string
    error?: string
  }>('/api/requests', { method: 'POST', token, body: request })
  if (!response.ok || response.body.created !== true || !response.body.requestId)
    throw apiError(
      response,
      'Não foi possível registrar a solicitação agora. Tente novamente.',
    )
  return response.body.requestId
}
