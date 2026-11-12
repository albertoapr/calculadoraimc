import { getRequestApiEndpoint } from './api'

export async function createFitpesoRequest(request: Record<string, unknown>, token: string) {
  const endpoint = await getRequestApiEndpoint()
  if (!token) throw new Error('Entre na sua conta para enviar a solicitação.')
  const response = await fetch(`${endpoint}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
  })
  const body = (await response.json()) as {
    created?: boolean
    requestId?: string
    error?: string
  }
  if (!response.ok || body.created !== true || !body.requestId) {
    throw new Error(
      body.error || 'Não foi possível registrar a solicitação agora. Tente novamente.',
    )
  }
  return body.requestId
}
