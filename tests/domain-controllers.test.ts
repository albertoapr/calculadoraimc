import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { useAdminTrainers } from '../src/composables/useAdminTrainers'
import { useTrainerProposal } from '../src/composables/useTrainerProposal'

test('domain controllers preserve authorization, payloads, busy guards and API errors', async (t) => {
  const originalFetch = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  let reply: unknown = {}
  let status = 200
  let release: (() => void) | undefined
  let pending: Promise<void> | undefined
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/amplify_outputs.json') {
      return Response.json({ custom: { imcApi: { endpoint: 'https://api.test' } } })
    }
    calls.push({ url: String(url), init })
    if (pending) await pending
    return Response.json(reply, { status })
  }
  try {
    const isAdmin = ref(false)
    let token = 'session-1'
    const admin = useAdminTrainers({ isAdmin, getToken: () => token, onOpen: () => {} })

    await t.test(
      'admin operations require an authorized session before calling the API',
      async () => {
        await admin.saveAdminTrainer()
        assert.equal(calls.length, 0)
        isAdmin.value = true
        token = ''
        await admin.loadAdminTrainers()
        assert.equal(calls.length, 0)
        assert.match(admin.adminTrainersStatus.value, /Entre novamente/)
        token = 'session-2'
      },
    )

    await t.test('registration normalizes academies and blocks double submission', async () => {
      Object.assign(admin.adminTrainerForm, { name: 'Personal Teste', academias: ' A, , B ' })
      reply = { registered: true }
      pending = new Promise<void>((resolve) => {
        release = resolve
      })
      const saving = admin.saveAdminTrainer()
      await admin.saveAdminTrainer()
      release!()
      await saving
      pending = undefined
      assert.equal(calls.length, 1)
      assert.equal(calls[0].init?.method, 'POST')
      assert.equal(new Headers(calls[0].init?.headers).get('authorization'), 'Bearer session-2')
      assert.deepEqual(JSON.parse(String(calls[0].init?.body)).academias, ['A', 'B'])
      assert.equal(admin.adminTrainerBusy.value, false)
      assert.match(admin.adminTrainerStatus.value, /sucesso/)
    })

    await t.test('editing preserves escaped IDs and displays backend failures', async () => {
      admin.selectedAdminTrainerId.value = 'id/with space'
      admin.adminTrainerEditForm.cities = ['Mesquita']
      reply = { error: 'Cadastro não permitido' }
      status = 403
      await admin.saveAdminTrainerEdit()
      assert.match(calls.at(-1)!.url, /id%2Fwith%20space$/)
      assert.equal(calls.at(-1)!.init?.method, 'PUT')
      assert.equal(admin.adminTrainersStatus.value, 'Cadastro não permitido')
      assert.equal(admin.adminTrainerEditBusy.value, false)
    })

    const proposal = useTrainerProposal('token/one')
    await t.test('expired requests keep the existing message', async () => {
      status = 410
      reply = { expired: true }
      await proposal.loadTrainerRequest()
      assert.match(proposal.trainerRequestStatus.value, /expirou/)
      assert.equal(proposal.trainerRequest.value, null)
      assert.match(calls.at(-1)!.url, /token=token%2Fone$/)
    })

    await t.test('only confirmed proposals mark the request as submitted', async () => {
      status = 200
      reply = {
        request: {
          clientName: 'Cliente',
          city: 'Mesquita',
          attendsGym: false,
          trainingDays: [],
          trainingShifts: [],
          validUntil: 1,
        },
      }
      await proposal.loadTrainerRequest()
      proposal.trainerProposalPrice.value = '120'
      proposal.trainerProposalMessage.value = 'Proposta teste'
      reply = { submitted: false, error: 'Proposta recusada' }
      await proposal.submitTrainerProposal()
      assert.equal(proposal.trainerRequest.value?.proposalAlreadySent, undefined)
      assert.equal(proposal.trainerRequestStatus.value, 'Proposta recusada')
      reply = { submitted: true }
      await proposal.submitTrainerProposal()
      assert.equal(proposal.trainerRequest.value?.proposalAlreadySent, true)
      assert.equal(proposal.trainerProposalSubmitting.value, false)
      assert.deepEqual(JSON.parse(String(calls.at(-1)!.init?.body)), {
        token: 'token/one',
        monthlyPrice: 120,
        message: 'Proposta teste',
      })
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
