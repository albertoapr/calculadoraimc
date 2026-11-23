import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, createApp, effectScope, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, routerKey } from 'vue-router'
import { JSDOM } from 'jsdom'
import { useHome } from '../src/composables/useHome'
import { useTrainingDraft } from '../src/stores/trainingDraft'
import type { AppViewMode } from '../src/types/navigation'

test('a home do slug abre com a unidade selecionada e só busca a lista ao trocar de academia', async (t) => {
  const dom = new JSDOM('', { url: 'https://fitpeso.com.br/' })
  dom.window.scrollTo = () => {}
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of ['window', 'localStorage', 'sessionStorage']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
  }
  const scope = effectScope()
  t.after(() => {
    scope.stop()
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })

  const slug = 'aquaticcenter-vilaemil'
  const displayName = 'Aquatic Center — Vila Emil'
  const academy = {
    academyId: 'gym-1',
    slug,
    name: 'Aquatic Center',
    neighborhood: 'Vila Emil',
    city: 'Mesquita',
  }
  const requested: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (input === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.example.test' } } })
    requested.push(new URL(input).pathname)
    if (input.endsWith('/by-slug/' + slug)) return Response.json({ academy })
    if (input.includes('?city=Mesquita')) return Response.json({ academies: [academy] })
    return Response.json({ error: 'Academia não encontrada.' }, { status: 404 })
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: {} }],
  })
  await router.push('/academias/' + slug)
  const app = createApp({})
  app.provide(routerKey, router)
  setActivePinia(createPinia())
  const preferences: string[] = []
  const home = scope.run(() =>
    app.runWithContext(() =>
      useHome({
        viewMode: ref<AppViewMode>('home'),
        isRootHome: computed(() => true),
        form: useTrainingDraft().form,
        showRequestForm: ref(false),
        requestStep: ref(1),
        selectingTrainersForDraft: ref(false),
        selectedTrainerIds: ref([]),
        homeSelectedTrainerIds: ref([]),
        sharingRequestId: ref(''),
        sharingRequestMessage: ref(''),
        openRequestForm: async () => {},
        sendRequestToSelectedTrainers() {},
        readNavigationPreference: () => 'Nilópolis',
        saveNavigationPreference: (_key, value) => preferences.push(value),
      }),
    ),
  )!

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(home.homeCity.value, 'Mesquita')
  assert.equal(home.publicTrainerAcademy.value, displayName)
  assert.equal(home.homeAcademySelected.value, true)
  assert.deepEqual(requested, ['/api/academies/by-slug/' + slug])
  assert.deepEqual(preferences, [])
  assert.equal(localStorage.getItem('fitpeso:home-academy:v2'), null)

  home.loadHomeAcademies()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(requested, ['/api/academies/by-slug/' + slug, '/api/academies'])
  assert.equal(home.publicTrainerAcademy.value, displayName)
  home.openPublicTrainers()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(router.currentRoute.value.path, '/mesquita/academia/aquatic-center/vila-emil')

  await router.push('/academias/inexistente')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(home.sharedAcademyError.value, 'Academia não encontrada.')
  assert.equal(home.publicTrainerAcademy.value, '')
})
