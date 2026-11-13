import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { useCustomerRequests } from '../src/composables/useCustomerRequests'
import type { CustomerRequest, CustomerProposal } from '../src/types/domain'

test('customer requests preserve visibility, session, sharing and proposal rules', async (t) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { scrollTo() {} },
  })
  const signedInName = ref('')
  const selectedTrainerIds = ref<string[]>([])
  let token = ''
  let opened = 0
  let message = ''
  let reply: unknown = {}
  let status = 200
  let pending: Promise<void> | undefined
  const calls: { url: string; init?: RequestInit }[] = []
  const open: CustomerRequest = {
    requestId: 'request/one',
    city: 'Mesquita',
    lifecycle: 'OPEN',
    proposalCount: 0,
    validUntil: Date.now() / 1000 + 3600,
    proposals: [],
  }
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/amplify_outputs.json')
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.test' } } })
    calls.push({ url: String(url), init })
    if (pending) await pending
    if (String(url).endsWith('/api/customers/requests'))
      return Response.json({ requests: Array.isArray(reply) ? reply : [open] })
    return Response.json(reply, { status })
  }
  const requests = useCustomerRequests({
    signedInName,
    selectedTrainerIds,
    getToken: () => token,
    onOpen: () => {
      opened++
    },
    onStatus: (text) => {
      message = text
    },
  })
  try {
    await t.test('unsigned visitors and missing sessions do not query the API', async () => {
      await requests.refreshShareableRequests()
      await requests.openCustomerRequests()
      assert.equal(calls.length, 0)
      assert.match(requests.customerRequestsStatus.value, /Entre na sua conta/)
      assert.equal(opened, 1)
    })

    await t.test(
      'listing and sharing use only requests that are still open and unexpired',
      async () => {
        signedInName.value = 'Cliente'
        token = 'customer-session'
        reply = [
          { ...open, requestId: 'inactive', lifecycle: 'INACTIVE' },
          { ...open, requestId: 'expired', validUntil: 1 },
          { ...open, requestId: 'flagged', requestExpired: true },
          open,
        ]
        await requests.refreshShareableRequests()
        assert.equal(requests.sharingRequestId.value, open.requestId)
        await requests.openCustomerRequests()
        assert.deepEqual(
          requests.customerRequests.value.map((item) => item.requestId),
          [open.requestId],
        )
        assert.equal(
          new Headers(calls.at(-1)!.init?.headers).get('authorization'),
          'Bearer customer-session',
        )
        assert.equal(calls.at(-1)!.init?.cache, 'no-store')
      },
    )

    await t.test(
      'sharing requires a selection, encodes IDs and blocks repeated clicks',
      async () => {
        const before = calls.length
        await requests.sendRequestToSelectedTrainers()
        assert.equal(calls.length, before)
        assert.match(requests.sharingRequestMessage.value, /Selecione/)
        selectedTrainerIds.value = ['p1', 'p2']
        reply = { sent: true, added: 2 }
        let release!: () => void
        pending = new Promise<void>((resolve) => {
          release = resolve
        })
        const sending = requests.sendRequestToSelectedTrainers()
        await requests.sendRequestToSelectedTrainers()
        release()
        await sending
        pending = undefined
        const sent = calls.filter((call) => call.url.endsWith('/send-to-trainers'))
        assert.equal(sent.length, 1)
        assert.match(sent[0].url, /request%2Fone/)
        assert.deepEqual(JSON.parse(String(sent[0].init?.body)), { trainerIds: ['p1', 'p2'] })
        assert.deepEqual(selectedTrainerIds.value, [])
        assert.match(requests.sharingRequestMessage.value, /2 personais/)
        assert.equal(requests.sharingRequestBusy.value, false)
      },
    )

    await t.test('requests with proposals or expired requests cannot be inactivated', async () => {
      await requests.changeRequestVisibility({ ...open, proposalCount: 1 }, 'deactivate')
      await requests.changeRequestVisibility({ ...open, validUntil: 1 }, 'deactivate')
      await requests.changeRequestVisibility(open, 'reactivate')
      assert.equal(requests.requestActionDialog.value, null)
      await requests.changeRequestVisibility(open, 'deactivate')
      reply = { error: 'Operação recusada' }
      status = 409
      await requests.confirmRequestVisibilityChange()
      assert.equal(requests.requestActionDialog.value?.action, 'deactivate')
      assert.equal(requests.requestActionError.value, 'Operação recusada')
      assert.equal(requests.changingRequestId.value, '')
      const call = calls.at(-1)!
      assert.match(call.url, /request%2Fone\/visibility$/)
      assert.deepEqual(JSON.parse(String(call.init?.body)), { action: 'deactivate' })

      reply = { updated: true }
      status = 200
      await requests.confirmRequestVisibilityChange()
      assert.equal(requests.requestActionDialog.value, null)
      assert.match(requests.customerRequestsStatus.value, /inativada/)
    })

    await t.test(
      'expired proposals are ignored and acceptance errors do not report success',
      async () => {
        const proposal: CustomerProposal = {
          trainerId: 'p1',
          name: 'Personal',
          whatsapp: '',
          monthlyPrice: 100,
          message: '',
          status: 'OPEN',
          validUntil: 1,
          expired: true,
        }
        const before = calls.length
        await requests.acceptProposal(open, proposal)
        assert.equal(calls.length, before)
        reply = { error: 'Proposta indisponível' }
        status = 409
        await requests.acceptProposal(open, { ...proposal, expired: false })
        assert.equal(message, 'Proposta indisponível')
        assert.match(calls.at(-1)!.url, /request%2Fone\/accept$/)
        assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), { trainerId: 'p1' })

        reply = { accepted: true }
        status = 200
        await requests.acceptProposal(open, { ...proposal, expired: false })
        assert.match(message, /Proposta de Personal aceita/)
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})
