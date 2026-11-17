import { getRequestApiEndpoint } from '../api'

export type ApiQueryValue = string | number | boolean | null | undefined
export type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  token?: string
  query?: Record<string, ApiQueryValue | ApiQueryValue[]>
  body?: unknown
  headers?: HeadersInit
}

export type ApiResponse<T> = {
  ok: boolean
  status: number
  headers: Headers
  body: T
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string
  readonly details?: unknown

  constructor(
    message: string,
    options: { status: number; code?: string; requestId?: string; details?: unknown },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.details = options.details
  }
}

function buildQuery(query?: ApiRequestOptions['query']) {
  const parameters = new URLSearchParams()
  for (const [name, rawValue] of Object.entries(query ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      if (value !== undefined && value !== null) parameters.append(name, String(value))
    }
  }
  const serialized = parameters.toString()
  return serialized ? `?${serialized}` : ''
}

function responseBody<T>(response: Response, rawBody: string): T {
  if (!rawBody) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  const looksLikeJson = /^\s*[\[{]/.test(rawBody)
  if (!contentType.includes('json') && !looksLikeJson) return rawBody as T
  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw new ApiError('A API retornou uma resposta inválida.', {
      status: response.status,
      requestId: response.headers.get('x-request-id') ?? undefined,
    })
  }
}

/**
 * Único ponto de transporte HTTP do frontend.
 *
 * Os serviços de domínio definem as operações; este cliente resolve o endpoint,
 * serializa query/body, aplica a sessão e normaliza a resposta.
 */
export async function requestApi<T>(
  path: `/api/${string}`,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const { token, query, body, headers: customHeaders, ...requestInit } = options
  const endpoint = await getRequestApiEndpoint(requestInit.signal ?? undefined)
  if (requestInit.signal?.aborted) throw new DOMException('Request canceled', 'AbortError')

  const headers = new Headers(customHeaders)
  headers.set('accept', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined && !headers.has('content-type'))
    headers.set('content-type', 'application/json')

  const response = await fetch(`${endpoint}${path}${buildQuery(query)}`, {
    cache: 'no-store',
    ...requestInit,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const rawBody = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    body: responseBody<T>(response, rawBody),
  }
}

export function apiError(
  response: ApiResponse<{ error?: string; code?: string; details?: unknown }>,
  fallback: string,
): ApiError {
  return new ApiError(response.body?.error || fallback, {
    status: response.status,
    code: response.body?.code,
    requestId: response.headers.get('x-request-id') ?? undefined,
    details: response.body?.details,
  })
}
