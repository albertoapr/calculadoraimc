import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { requestApi } from '../src/services/http/apiClient'

test('cliente HTTP centraliza endpoint, query, JSON e sessão Bearer', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ input: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ input: url, init })
    if (url === '/amplify_outputs.json') {
      return new Response(
        JSON.stringify({ custom: { imcApi: { endpoint: 'https://api.example.test/prod/' } } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({ updated: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
    })
  }) as typeof fetch

  try {
    const response = await requestApi<{ updated: boolean }>('/api/example', {
      method: 'POST',
      token: 'session-token',
      query: { city: 'Rio de Janeiro', active: true, empty: undefined },
      body: { name: 'FitPeso' },
    })

    assert.equal(response.body.updated, true)
    assert.equal(
      calls[1].input,
      'https://api.example.test/prod/api/example?city=Rio+de+Janeiro&active=true',
    )
    const headers = new Headers(calls[1].init?.headers)
    assert.equal(headers.get('authorization'), 'Bearer session-token')
    assert.equal(headers.get('content-type'), 'application/json')
    assert.equal(calls[1].init?.body, JSON.stringify({ name: 'FitPeso' }))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('serviços de domínio não usam fetch diretamente', async () => {
  const directory = new URL('../src/services/', import.meta.url)
  const entries = await readdir(directory, { recursive: true })
  const allowed = new Set(['api.ts', 'http/apiClient.ts'])

  for (const entry of entries) {
    if (!entry.endsWith('.ts') || allowed.has(entry)) continue
    const source = await readFile(new URL(entry, directory), 'utf8')
    assert.equal(source.includes('fetch('), false, `${entry} deve usar requestApi`)
  }
})
