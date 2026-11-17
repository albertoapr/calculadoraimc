import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { JSDOM } from 'jsdom'
import { useAdminTrainers } from '../src/composables/useAdminTrainers'
import type { AdminTrainer } from '../src/types/domain'

test('gestão de profissionais reúne busca, cadastro, edição e desativação', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' })
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })

  const trainers: AdminTrainer[] = [
    {
      trainerId: 'trainer-1',
      name: 'Ana Silva',
      whatsapp: '21999999999',
      email: 'ana@example.test',
      dateOfBirth: '1990-02-01',
      sex: 'feminino',
      cref: '123-G/RJ',
      instagram: '@ana',
      slug: 'ana-silva',
      cities: ['Mesquita'],
      academias: [],
      academyIds: [],
      active: true,
    },
    {
      trainerId: 'trainer-2',
      name: 'Bruno Lima',
      whatsapp: '21888888888',
      email: 'bruno@example.test',
      dateOfBirth: '1988-04-03',
      sex: 'masculino',
      cref: '456-G/RJ',
      instagram: '@bruno',
      slug: 'bruno-lima',
      cities: ['Nilópolis'],
      academias: [],
      academyIds: [],
      active: false,
    },
  ]
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.example.test' } } })
    if (url.endsWith('/api/admin/academies'))
      return Response.json({
        academies: [
          {
            academyId: 'academy-1',
            name: 'Academia Teste',
            city: 'Mesquita',
            neighborhood: 'Centro',
            state: 'RJ',
            address: '',
            zipCode: '',
            active: true,
            createdAt: '',
            updatedAt: '',
          },
        ],
      })
    if (url.endsWith('/api/admin/trainers') && (!init?.method || init.method === 'GET'))
      return Response.json({ trainers })
    if (url.endsWith('/api/admin/trainers') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      writes.push({ method: 'POST', path: url, body })
      trainers.push({
        trainerId: 'trainer-3',
        ...(body as Omit<AdminTrainer, 'trainerId'>),
      })
      return Response.json({ registered: true, trainerId: 'trainer-3' }, { status: 201 })
    }
    if (url.includes('/api/admin/trainers/') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      writes.push({ method: 'PUT', path: url, body })
      const trainer = trainers.find((item) => url.endsWith(item.trainerId))
      if (trainer) Object.assign(trainer, body)
      return Response.json({ updated: true })
    }
    throw new Error('Unexpected request: ' + url)
  }) as typeof fetch

  try {
    const manager = useAdminTrainers({
      isAdmin: ref(true),
      getToken: () => 'admin-session',
      onOpen() {},
    })
    await manager.loadAdminTrainers()
    assert.equal(manager.filteredAdminTrainers.value.length, 2)

    manager.adminTrainerSearch.value = 'bruno'
    assert.deepEqual(
      manager.filteredAdminTrainers.value.map((trainer) => trainer.trainerId),
      ['trainer-2'],
    )
    manager.adminTrainerActivityFilter.value = 'active'
    assert.equal(manager.filteredAdminTrainers.value.length, 0)

    manager.adminTrainerSearch.value = ''
    manager.adminTrainerActivityFilter.value = 'all'
    manager.startNewAdminTrainer()
    Object.assign(manager.adminTrainerForm, {
      name: 'Carlos Souza',
      whatsapp: '21777777777',
      email: 'carlos@example.test',
      dateOfBirth: '1992-05-10',
      sex: 'masculino',
      cref: '789-G/RJ',
      instagram: '@carlos',
      slug: 'carlos-souza',
      cities: ['Mesquita'],
    })
    await manager.saveAdminTrainer()
    assert.equal(writes[0].method, 'POST')
    assert.equal(writes[0].body.dateOfBirth, '1992-05-10')
    assert.equal(manager.selectedAdminTrainerId.value, 'trainer-3')

    await manager.deactivateAdminTrainer()
    assert.equal(writes[1].method, 'PUT')
    assert.equal(writes[1].body.active, false)
    assert.equal(manager.adminTrainerForm.active, false)
    assert.match(manager.adminTrainersStatus.value, /desativado/i)
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
    dom.window.close()
  }
})
