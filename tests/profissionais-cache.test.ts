import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listEligibleTrainers,
  getCachedEligibleTrainers,
} from '../src/services/profissionaisService'

test('deduplica buscas simultâneas e reutiliza profissionais em cache', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let endpointCalls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url === '/amplify_outputs.json') {
      endpointCalls++
      return new Response(
        JSON.stringify({ custom: { imcApi: { endpoint: 'https://api.example.test/prod' } } }),
        { status: 200 },
      )
    }
    if (url.startsWith('https://api.example.test/prod/api/trainers/eligible?')) {
      calls++
      await Promise.resolve()
      return new Response(
        JSON.stringify({
          trainers: [
            {
              trainerId: 'trainer-1',
              name: 'Profissional Teste',
              slug: 'profissional-teste',
              sex: 'feminino',
            },
          ],
        }),
        { status: 200 },
      )
    }
    throw new Error('Unexpected request: ' + url)
  }) as typeof fetch

  try {
    const city = 'Mesquita'
    const [first, second] = await Promise.all([
      listEligibleTrainers(city, 'indiferente'),
      listEligibleTrainers(city, 'indiferente'),
    ])
    assert.deepEqual(first, second)
    assert.equal(calls, 1)
    assert.equal(endpointCalls, 1)
    assert.equal(getCachedEligibleTrainers(city, 'indiferente')?.length, 1)
    const third = await listEligibleTrainers(city, 'indiferente')
    assert.deepEqual(third, first)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
