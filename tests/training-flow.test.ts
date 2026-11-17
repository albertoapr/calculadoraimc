import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computed, effectScope, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { JSDOM } from 'jsdom'
import { useHome } from '../src/composables/useHome'
import { useTrainingRequest } from '../src/composables/useTrainingRequest'
import { useTrainingDraft } from '../src/stores/trainingDraft'
import { storeToRefs } from 'pinia'
import type { AppViewMode } from '../src/types/navigation'

test('home selection survives the training flow and submission preserves the request contract', async () => {
  const dom = new JSDOM('', { url: 'http://localhost/' })
  const originalFetch = globalThis.fetch
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of ['window', 'navigator', 'localStorage', 'sessionStorage']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
  }
  dom.window.scrollTo = () => {}
  const payloads: Record<string, unknown>[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'http://localhost/mock' } } })
    if (url.endsWith('/api/requests')) {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer customer-session')
      payloads.push(JSON.parse(String(init?.body)))
      return Response.json({ created: true, requestId: 'r1' })
    }
    if (url.includes('/api/academies')) return Response.json({ academies: [] })
    return Response.json({
      trainers: [
        { trainerId: 'p1', name: 'Ana Silva', slug: 'ana', academias: ['Academia Teste'] },
      ],
    })
  }
  setActivePinia(createPinia())
  const scope = effectScope()
  try {
    const flow = scope.run(() => {
      const draft = useTrainingDraft()
      const { trainingStartMinutes, trainingEndMinutes } = storeToRefs(draft)
      const viewMode = ref<AppViewMode>('home')
      const showRequestForm = ref(false)
      const requestStep = ref(1)
      const selectingTrainersForDraft = ref(false)
      const selectedTrainerIds = ref<string[]>([])
      const homeSelectedTrainerIds = ref<string[]>([])
      const sharingRequestId = ref('')
      const sharingRequestMessage = ref('')
      const customerSignedInName = ref('')
      const status = ref('')
      let loginRequests = 0
      let request: ReturnType<typeof useTrainingRequest>
      const home = useHome({
        viewMode,
        isRootHome: computed(() => true),
        form: draft.form,
        showRequestForm,
        requestStep,
        selectingTrainersForDraft,
        selectedTrainerIds,
        homeSelectedTrainerIds,
        sharingRequestId,
        sharingRequestMessage,
        openRequestForm: () => request.openRequestForm(),
        sendRequestToSelectedTrainers() {},
        readNavigationPreference: () => 'Mesquita',
        saveNavigationPreference() {},
      })
      request = useTrainingRequest({
        viewMode,
        showRequestForm,
        requestStep,
        selectingTrainersForDraft,
        selectedTrainerIds,
        homeSelectedTrainerIds,
        sharingRequestId,
        sharingRequestMessage,
        customerSignedInName,
        form: draft.form,
        trainingStartMinutes,
        trainingEndMinutes,
        status,
        home,
        async refreshShareableRequests() {},
        async openCustomerLogin() {
          loginRequests += 1
        },
        onContactReset() {},
      })
      return {
        home,
        request,
        draft,
        viewMode,
        status,
        selectedTrainerIds,
        homeSelectedTrainerIds,
        sharingRequestMessage,
        customerSignedInName,
        getLoginRequests: () => loginRequests,
      }
    })!
    flow.home.publicTrainerCity.value = 'Mesquita'
    await flow.home.loadPublicTrainers()
    await nextTick()
    flow.home.publicTrainerAcademy.value = 'Academia Teste'
    await nextTick()
    assert.equal(sessionStorage.getItem('fitpeso:home-academy-session:v1'), 'Academia Teste')
    flow.homeSelectedTrainerIds.value = ['p1']
    await flow.home.startTrainingRequestFromHome()
    assert.equal(flow.viewMode.value, 'contact')
    assert.deepEqual(flow.selectedTrainerIds.value, ['p1'])
    assert.equal(flow.draft.form.singleLesson, true)
    assert.equal(flow.draft.form.gymName, 'Academia Teste')
    assert.equal(flow.draft.form.age, '40')

    await flow.request.selectTrainersForDraft()
    assert.equal(flow.viewMode.value, 'select-trainers')
    flow.homeSelectedTrainerIds.value = []
    await flow.request.returnToDraftSummary()
    assert.equal(flow.viewMode.value, 'select-trainers')
    assert.match(flow.sharingRequestMessage.value, /Selecione pelo menos um personal/)
    flow.homeSelectedTrainerIds.value = ['p1']
    await flow.request.returnToDraftSummary()
    await flow.request.confirmServiceRequest()
    assert.equal(flow.getLoginRequests(), 1)
    assert.equal(payloads.length, 0)

    flow.customerSignedInName.value = 'Cliente Teste'
    sessionStorage.setItem('fitpeso-customer-session', 'customer-session')
    Object.assign(flow.draft.form, { name: 'Cliente Teste', phone: '21999999999', age: '40' })
    await flow.request.confirmServiceRequest()
    assert.equal(payloads.length, 1)
    assert.deepEqual(payloads[0].selectedTrainerIds, ['p1'])
    assert.equal(payloads[0].desiredDuration, 'Aula avulsa')
    assert.equal(payloads[0].city, 'Mesquita')
    assert.equal(payloads[0].trainingStartTime, '18:00')
    assert.equal(flow.request.submittingRequest.value, false)
  } finally {
    scope.stop()
    dom.window.close()
    globalThis.fetch = originalFetch
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
