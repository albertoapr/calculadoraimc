import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useAccountProfile } from '../src/composables/useAccountProfile'
import type { CustomerAccountProfile, TrainerAccountProfile } from '../src/types/domain'

test('account profile loads and saves customer and trainer data outside the app controller', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { scrollTo() {} },
  })
  const calls: { url: string; init?: RequestInit }[] = []
  let responseBody: unknown = {}
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.test' } } })
    calls.push({ url: String(url), init })
    return Response.json(responseBody)
  }

  try {
    await t.test('customer profile keeps the existing load and update contract', async () => {
      let viewOpen = false
      let applied: CustomerAccountProfile | undefined
      let afterSave = 0
      responseBody = {
        authenticated: true,
        profile: {
          name: 'Maria Silva',
          whatsapp: '5521988887777',
          email: 'maria@example.com',
          dateOfBirth: '1990-05-10',
        },
      }
      const account = useAccountProfile({
        isTrainer: () => false,
        getToken: () => 'customer-token',
        openView: () => {
          viewOpen = true
        },
        isViewOpen: () => viewOpen,
        applyCustomerProfile: (profile) => {
          applied = profile
        },
        applyTrainerSession: () => {},
        afterCustomerSave: async () => {
          afterSave++
        },
      })

      await account.openMyProfile()
      assert.equal(account.editingProfile.name, 'Maria Silva')
      assert.equal(calls.at(-1)?.url, 'https://api.test/api/customers/profile')
      assert.equal(
        new Headers(calls.at(-1)?.init?.headers).get('authorization'),
        'Bearer customer-token',
      )

      account.editingProfile.name = '  Maria   Souza  '
      responseBody = {
        authenticated: true,
        profile: {
          name: 'Maria Souza',
          whatsapp: '5521988887777',
          email: 'maria@example.com',
          dateOfBirth: '1990-05-10',
        },
      }
      await account.saveMyProfile()
      const update = calls.at(-1)!
      assert.equal(update.url, 'https://api.test/api/customers/update-profile')
      assert.deepEqual(JSON.parse(String(update.init?.body)), {
        name: 'Maria Souza',
        dateOfBirth: '1990-05-10',
      })
      assert.equal(applied?.name, 'Maria Souza')
      assert.equal(afterSave, 1)
      assert.equal(account.editingProfileStatus.value, 'Cadastro atualizado com sucesso.')
    })

    await t.test('trainer profile keeps its specific fields and endpoint', async () => {
      let viewOpen = false
      let applied: TrainerAccountProfile | undefined
      responseBody = {
        authenticated: true,
        profile: {
          trainerId: 'trainer-1',
          name: 'João Lima',
          whatsapp: '5521977776666',
          email: 'joao@example.com',
          dateOfBirth: '1985-02-20',
          instagram: '@joao.personal',
          cref: '123-G/RJ',
          slug: 'joao-lima',
          academias: ['Academia Central'],
        },
      }
      const account = useAccountProfile({
        isTrainer: () => true,
        getToken: () => 'trainer-token',
        openView: () => {
          viewOpen = true
        },
        isViewOpen: () => viewOpen,
        applyCustomerProfile: () => {},
        applyTrainerSession: (profile) => {
          applied = profile
        },
        afterCustomerSave: async () => {},
      })

      await account.openMyProfile()
      assert.equal(account.editingProfile.instagram, '@joao.personal')
      assert.deepEqual(account.editingProfile.academias, ['Academia Central'])
      assert.equal(calls.at(-1)?.url, 'https://api.test/api/trainers/profile')

      await account.saveMyProfile()
      const update = calls.at(-1)!
      assert.equal(update.url, 'https://api.test/api/trainers/update-profile')
      assert.deepEqual(JSON.parse(String(update.init?.body)), {
        name: 'João Lima',
        dateOfBirth: '1985-02-20',
        instagram: '@joao.personal',
        cref: '123-G/RJ',
        academias: ['Academia Central'],
      })
      assert.equal(applied?.trainerId, 'trainer-1')
    })
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    })
  }
})
